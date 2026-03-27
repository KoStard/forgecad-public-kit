import { getActiveBackend, init, runScript, setActiveBackend, setParamOverrides } from '@forge/index';
import type { RunResult } from '@forge/runner';
import { isOCCTShapeBackend } from '../forge/backends/occt/shapeBackend';
import { buildBrepBlob } from '../forge/export/exportBrepNative';
import { buildStepBlob } from '../forge/export/exportStep';
import { getShapeRuntimeBackend } from '../forge/kernel';
import { serializeRunResult } from '../forge/serializeRunResult';
import { getSolverWasmRunDebugSnapshot, resetSolverWasmStats } from '../forge/sketch/constraints/solver-wasm';
import { parseNotebook, resolveNotebookPreviewCellId } from '../notebook/model';
import { runNotebook } from '../notebook/runtime';
import type { EvalWorkerExportExactRequest, EvalWorkerRequest, EvalWorkerResponse, EvalWorkerRunPayload } from './evalWorkerProtocol';

type WorkerContext = {
  onmessage: ((event: MessageEvent<EvalWorkerRequest>) => void) | null;
  postMessage: (message: EvalWorkerResponse, transfer?: Transferable[]) => void;
};

/**
 * Synchronous binary file reader for importMesh() in the browser.
 * Uses sync XMLHttpRequest (allowed in web workers) to fetch from the server.
 *
 * Note: sync XHR ignores `responseType = 'arraybuffer'`, so we use
 * `overrideMimeType` to get raw binary bytes as a latin-1 string, then
 * manually convert to ArrayBuffer.
 */
function readBinaryFile(resolvedPath: string): ArrayBuffer {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `/api/read-binary?path=${encodeURIComponent(resolvedPath)}`, false);
  xhr.overrideMimeType('text/plain; charset=x-user-defined');
  xhr.send();
  if (xhr.status !== 200) {
    throw new Error(`Failed to read binary file "${resolvedPath}": ${xhr.statusText || `HTTP ${xhr.status}`}`);
  }
  const contentType = xhr.getResponseHeader('Content-Type') || '';
  const text = xhr.responseText;
  if (text.length === 0) {
    throw new Error(`readBinaryFile("${resolvedPath}"): server returned empty response`);
  }
  // Detect if the server returned an error page (HTML/JSON) instead of binary data
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error(
      `readBinaryFile("${resolvedPath}"): server returned ${contentType} instead of binary data. ` +
        `Response starts with: "${text.slice(0, 100)}"`,
    );
  }
  const buf = new ArrayBuffer(text.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < text.length; i++) {
    view[i] = text.charCodeAt(i) & 0xff;
  }
  return buf;
}

const worker = globalThis as unknown as WorkerContext;

// Cache the init() promise so concurrent handlers await the same instance.
let kernelReadyPromise: Promise<void> | null = null;
function ensureKernelReady(): Promise<void> {
  if (!kernelReadyPromise) kernelReadyPromise = init();
  return kernelReadyPromise;
}

// Last successful RunResult — kept alive so face-info requests can access live shapes.
let lastRunResult: RunResult | null = null;

// Serial execution: process one run at a time, keep only the latest queued request.
let isExecuting = false;
let queuedPayload: EvalWorkerRunPayload | null = null;

async function runOnce(payload: EvalWorkerRunPayload): Promise<void> {
  const { seq, code, file, files, quality, paramOverrides, isNotebook, activeBackend } = payload;

  try {
    const t0 = performance.now();
    worker.postMessage({ type: 'progress', payload: { seq, phase: 'kernel-init' } });
    await ensureKernelReady();
    const tKernel = performance.now();

    worker.postMessage({ type: 'progress', payload: { seq, phase: 'evaluating' } });
    resetSolverWasmStats();
    setParamOverrides(paramOverrides);
    setActiveBackend(activeBackend);

    let runResult;
    if (isNotebook) {
      const notebook = parseNotebook(code);
      const targetCellId = resolveNotebookPreviewCellId(notebook);
      runResult = runNotebook(notebook, file, files, { quality, targetCellId }).displayResult;
    } else {
      runResult = runScript(code, file, files, { quality, readBinaryFile });
    }
    const tRun = performance.now();

    // If a newer run was queued while we were evaluating, skip serialization —
    // the client already rejected this seq's promise.
    if (queuedPayload !== null) {
      console.log(`[worker] seq=${seq} stale (newer queued) — skipping serialize. run=${(tRun - tKernel).toFixed(0)}ms`);
      return;
    }

    lastRunResult = runResult;
    worker.postMessage({ type: 'progress', payload: { seq, phase: 'serializing' } });
    const { serialized, transferables } = serializeRunResult(runResult, getSolverWasmRunDebugSnapshot());
    const tSerialize = performance.now();

    console.log(
      `[worker] seq=${seq} kernelInit=${(tKernel - t0).toFixed(0)}ms  run=${(tRun - tKernel).toFixed(0)}ms  serialize=${(tSerialize - tRun).toFixed(0)}ms  total=${(tSerialize - t0).toFixed(0)}ms`,
    );

    worker.postMessage({ type: 'run-success', payload: { seq, result: serialized } }, transferables);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    worker.postMessage({
      type: 'run-error',
      payload: { seq, message, logs: [] },
    });
  }
}

// ─── Export Exact (STEP / BREP) ─────────────────────────────────────

async function handleExportExact(data: EvalWorkerExportExactRequest): Promise<void> {
  const { reqId, format, code, file, files, quality, paramOverrides, isNotebook } = data.payload;
  const seq = -reqId; // negative seq for export progress messages

  try {
    // Phase 1: ensure we have OCCT-backed shapes
    worker.postMessage({ type: 'progress', payload: { seq, phase: 'export-evaluating' } });
    await ensureKernelReady();

    // If the worker has no live result or isn't OCCT-backed, re-run with OCCT
    if (!lastRunResult || getActiveBackend() !== 'occt') {
      resetSolverWasmStats();
      setParamOverrides(paramOverrides);
      setActiveBackend('occt');

      if (isNotebook) {
        const notebook = parseNotebook(code);
        const targetCellId = resolveNotebookPreviewCellId(notebook);
        lastRunResult = runNotebook(notebook, file, files, { quality, targetCellId }).displayResult;
      } else {
        lastRunResult = runScript(code, file, files, { quality, readBinaryFile });
      }

      if (lastRunResult.error) {
        throw new Error(`Script has errors: ${lastRunResult.error}`);
      }
    }

    const shapeObjects = lastRunResult.objects.filter((obj) => obj.shape);
    if (shapeObjects.length === 0) {
      throw new Error('No 3D shapes available for export.');
    }

    // Verify shapes are actually OCCT-backed
    const exportObjects = shapeObjects.map((obj) => {
      const backend = getShapeRuntimeBackend(obj.shape!);
      if (!isOCCTShapeBackend(backend)) {
        throw new Error(`Object "${obj.name}" is not OCCT-backed. Re-evaluate with the OCCT backend selected.`);
      }
      return { name: obj.name, shape: backend, color: obj.color };
    });

    // Phase 2: write the export file
    worker.postMessage({ type: 'progress', payload: { seq, phase: 'export-writing' } });

    let blob: Blob;
    if (format === 'step') {
      blob = await buildStepBlob(exportObjects);
    } else {
      blob = await buildBrepBlob(exportObjects);
    }

    const buffer = await blob.arrayBuffer();
    worker.postMessage({ type: 'export-exact-success', payload: { reqId, data: buffer, format } }, [buffer]);
  } catch (err) {
    worker.postMessage({
      type: 'export-exact-error',
      payload: { reqId, message: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ─── Message Handler ────────────────────────────────────────────────

worker.onmessage = async (event) => {
  const { data } = event;

  if (data.type === 'export-exact') {
    await handleExportExact(data);
    return;
  }

  if (data.type === 'face-info') {
    const { reqId, objectId } = data.payload;
    try {
      const obj = lastRunResult?.objects.find((o) => o.id === objectId);
      if (!obj?.shape) throw new Error(`Object '${objectId}' not found or has no shape`);

      const faceNames = obj.shape.faceNames();
      const faces: Record<string, ReturnType<typeof obj.shape.face>> = {};
      const faceHistories: Record<string, ReturnType<typeof obj.shape.faceHistory>> = {};
      for (const name of faceNames) {
        try {
          const ref = obj.shape.face(name);
          if (ref) {
            faces[name] = ref;
            faceHistories[name] = obj.shape.faceHistory(name);
          }
        } catch {
          /* skip */
        }
      }
      worker.postMessage({ type: 'face-info-success', payload: { reqId, result: { faceNames, faces, faceHistories } } });
    } catch (err) {
      worker.postMessage({ type: 'face-info-error', payload: { reqId, message: String(err) } });
    }
    return;
  }

  if (data.type !== 'run') return;

  if (isExecuting) {
    // Drop the previous queued payload — only the latest matters.
    queuedPayload = data.payload;
    return;
  }

  isExecuting = true;
  let current: EvalWorkerRunPayload | null = data.payload;

  while (current) {
    queuedPayload = null;
    await runOnce(current);
    current = queuedPayload; // pick up next if one arrived during this run
  }

  isExecuting = false;
};

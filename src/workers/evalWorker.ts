import { init, runScript, setParamOverrides, setActiveBackend } from '@forge/index';
import type { RunResult } from '@forge/runner';
import {
  getSolverWasmRunDebugSnapshot,
  resetSolverWasmStats,
} from '../forge/sketch/constraints/solver-wasm';
import { isNotebookFile, parseNotebook, resolveNotebookPreviewCellId } from '../notebook/model';
import { runNotebook } from '../notebook/runtime';
import { serializeRunResult } from '../forge/serializeRunResult';
import { getShapeRuntimeBackend } from '../forge/kernel';
import { isOCCTShapeBackend, requireOCCTShape } from '../forge/backends/occt/shapeBackend';
import { getOCCT } from '../forge/backends/occt/init';
import type { EvalWorkerRequest, EvalWorkerResponse, EvalWorkerRunPayload, EvalWorkerExportExactRequest } from './evalWorkerProtocol';

type WorkerContext = {
  onmessage: ((event: MessageEvent<EvalWorkerRequest>) => void) | null;
  postMessage: (message: EvalWorkerResponse, transfer?: Transferable[]) => void;
};

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
      runResult = runScript(code, file, files, { quality });
    }
    const tRun = performance.now();

    // If a newer run was queued while we were evaluating, skip serialization —
    // the client already rejected this seq's promise.
    if (queuedPayload !== null) {
      console.log(
        `[worker] seq=${seq} stale (newer queued) — skipping serialize. run=${(tRun - tKernel).toFixed(0)}ms`,
      );
      return;
    }

    lastRunResult = runResult;
    worker.postMessage({ type: 'progress', payload: { seq, phase: 'serializing' } });
    const { serialized, transferables } = serializeRunResult(runResult, getSolverWasmRunDebugSnapshot());
    const tSerialize = performance.now();

    console.log(
      `[worker] seq=${seq} kernelInit=${(tKernel - t0).toFixed(0)}ms  run=${(tRun - tKernel).toFixed(0)}ms  serialize=${(tSerialize - tRun).toFixed(0)}ms  total=${(tSerialize - t0).toFixed(0)}ms`,
    );

    worker.postMessage(
      { type: 'run-success', payload: { seq, result: serialized } },
      transferables,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    worker.postMessage({
      type: 'run-error',
      payload: { seq, message, logs: [] },
    });
  }
}

// ─── Export Exact (STEP / BREP) ─────────────────────────────────────

function ensureOCCTRunResult(request: EvalWorkerExportExactRequest): RunResult {
  const { code, file, files, quality, paramOverrides, isNotebook } = request.payload;

  // Check if lastRunResult has OCCT-backed shapes
  if (lastRunResult) {
    const shapes = lastRunResult.objects.filter((o) => o.shape);
    const allOCCT = shapes.length > 0 && shapes.every((o) => isOCCTShapeBackend(getShapeRuntimeBackend(o.shape!)));
    if (allOCCT) return lastRunResult;
  }

  // Re-run with OCCT backend
  setParamOverrides(paramOverrides);
  setActiveBackend('occt');
  let result: RunResult;
  if (isNotebook) {
    const notebook = parseNotebook(code);
    const targetCellId = resolveNotebookPreviewCellId(notebook);
    result = runNotebook(notebook, file, files, { quality, targetCellId }).displayResult;
  } else {
    result = runScript(code, file, files, { quality });
  }
  if (result.error) throw new Error(`Script error during export re-evaluation: ${result.error}`);
  lastRunResult = result;
  return result;
}

function writeStepBlob(shapes: { name: string; topoShape: any }[]): ArrayBuffer {
  const oc = getOCCT();
  const writer = new oc.STEPControl_Writer_1();

  for (const { topoShape } of shapes) {
    const status = writer.Transfer(
      topoShape,
      oc.STEPControl_StepModelType.STEPControl_AsIs,
      true,
      new oc.Message_ProgressRange_1(),
    );
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`STEP Transfer failed with status ${status}`);
    }
  }

  const virtualPath = '/tmp/forge-export.step';
  const writeStatus = writer.Write(virtualPath);
  if (writeStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`STEP Write failed with status ${writeStatus}`);
  }

  const fileData = oc.FS.readFile(virtualPath, { encoding: 'binary' });
  oc.FS.unlink(virtualPath);
  return fileData.buffer;
}

function writeBrepBlob(shapes: { name: string; topoShape: any }[]): ArrayBuffer {
  const oc = getOCCT();

  // For multiple shapes, create a compound
  let exportShape: any;
  if (shapes.length === 1) {
    exportShape = shapes[0].topoShape;
  } else {
    const builder = new oc.BRep_Builder();
    const compound = new oc.TopoDS_Compound();
    builder.MakeCompound(compound);
    for (const { topoShape } of shapes) {
      builder.Add(compound, topoShape);
    }
    exportShape = compound;
  }

  const virtualPath = '/tmp/forge-export.brep';
  oc.BRepTools.Write_3(exportShape, virtualPath, new oc.Message_ProgressRange_1());

  const fileData = oc.FS.readFile(virtualPath, { encoding: 'binary' });
  oc.FS.unlink(virtualPath);
  return fileData.buffer;
}

async function handleExportExact(request: EvalWorkerExportExactRequest): Promise<void> {
  const { reqId, format } = request.payload;

  try {
    // Use a fake seq for progress reporting
    const seq = -reqId;
    worker.postMessage({ type: 'progress', payload: { seq, phase: 'export-evaluating' } });
    await ensureKernelReady();

    const result = ensureOCCTRunResult(request);
    const shapeObjects = result.objects.filter((o) => o.shape);
    if (shapeObjects.length === 0) {
      throw new Error('No 3D shapes available for exact export.');
    }

    // Extract OCCT TopoDS_Shapes
    const shapes = shapeObjects.map((o) => ({
      name: o.name,
      topoShape: requireOCCTShape(getShapeRuntimeBackend(o.shape!), `${format.toUpperCase()} export`),
    }));

    worker.postMessage({ type: 'progress', payload: { seq, phase: 'export-writing' } });

    const buffer = format === 'step' ? writeStepBlob(shapes) : writeBrepBlob(shapes);

    worker.postMessage(
      { type: 'export-exact-success', payload: { reqId, blob: buffer } },
      [buffer],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    worker.postMessage({ type: 'export-exact-error', payload: { reqId, message } });
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
        } catch { /* skip */ }
      }
      worker.postMessage({ type: 'face-info-success', payload: { reqId, result: { faceNames, faces, faceHistories } } });
    } catch (err) {
      worker.postMessage({ type: 'face-info-error', payload: { reqId, message: String(err) } });
    }
    return;
  }

  if (data.type !== 'run') return; // unknown message type — ignore

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

import { init, runScript, setParamOverrides } from '@forge/index';
import { isNotebookFile, parseNotebook, resolveNotebookPreviewCellId } from '../notebook/model';
import { runNotebook } from '../notebook/runtime';
import { serializeRunResult } from '../forge/serializeRunResult';
import type { EvalWorkerRequest, EvalWorkerResponse, EvalWorkerRunPayload } from './evalWorkerProtocol';

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

// Serial execution: process one run at a time, keep only the latest queued request.
let isExecuting = false;
let queuedPayload: EvalWorkerRunPayload | null = null;

async function runOnce(payload: EvalWorkerRunPayload): Promise<void> {
  const { seq, code, file, files, quality, paramOverrides, isNotebook } = payload;

  try {
    const t0 = performance.now();
    await ensureKernelReady();
    const tKernel = performance.now();

    setParamOverrides(paramOverrides);

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

    const { serialized, transferables } = serializeRunResult(runResult);
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

worker.onmessage = async (event) => {
  const { data } = event;
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

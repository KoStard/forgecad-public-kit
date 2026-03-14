import { init, runScript, setParamOverrides } from '@forge/index';
import { isNotebookFile, parseNotebook, resolveNotebookPreviewCellId } from '../notebook/model';
import { runNotebook } from '../notebook/runtime';
import { serializeRunResult } from '../forge/serializeRunResult';
import type { EvalWorkerRequest, EvalWorkerResponse } from './evalWorkerProtocol';

type WorkerContext = {
  onmessage: ((event: MessageEvent<EvalWorkerRequest>) => void) | null;
  postMessage: (message: EvalWorkerResponse, transfer?: Transferable[]) => void;
};

const worker = globalThis as unknown as WorkerContext;

let kernelReady = false;

async function ensureKernelReady(): Promise<void> {
  if (kernelReady) return;
  await init();
  kernelReady = true;
}

worker.onmessage = async (event) => {
  const { data } = event;
  if (data.type !== 'run') return;

  const { seq, code, file, files, quality, paramOverrides, isNotebook } = data.payload;

  try {
    await ensureKernelReady();

    setParamOverrides(paramOverrides);

    let runResult;
    if (isNotebook) {
      const notebook = parseNotebook(code);
      const targetCellId = resolveNotebookPreviewCellId(notebook);
      runResult = runNotebook(notebook, file, files, { quality, targetCellId }).displayResult;
    } else {
      runResult = runScript(code, file, files, { quality });
    }

    const { serialized, transferables } = serializeRunResult(runResult);

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
};

import { generateReportPdf, init, runScript, setParamOverrides } from '@forge/index';
import type { ReportWorkerRequest, ReportWorkerResponse } from './reportWorkerProtocol';

type WorkerContext = {
  onmessage: ((event: MessageEvent<ReportWorkerRequest>) => void) | null;
  postMessage: (message: ReportWorkerResponse, transfer?: Transferable[]) => void;
};

const worker = globalThis as unknown as WorkerContext;

let kernelReady = false;

async function ensureKernelReady(): Promise<void> {
  if (kernelReady) return;
  await init();
  kernelReady = true;
}

function toPdfArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

worker.onmessage = async (event) => {
  const { data } = event;
  if (data.type !== 'generate-report') return;

  try {
    await ensureKernelReady();

    const { files, activeFile, paramOverrides, quality, title, objectVisuals, includeDisassembled, lengthUnit } = data.payload;
    const code = files[activeFile];
    if (!code) {
      throw new Error(`Active file "${activeFile}" is missing from project files.`);
    }

    setParamOverrides(paramOverrides);
    const runResult = runScript(code, activeFile, files, { quality });
    if (runResult.error) {
      throw new Error(runResult.error);
    }

    const report = generateReportPdf(runResult, {
      title,
      includeDisassembled,
      objectVisuals,
      lengthUnit,
    });

    const pdf = toPdfArrayBuffer(report.pdf);
    worker.postMessage(
      {
        type: 'generate-report-success',
        payload: {
          pdf,
          pageCount: report.pageCount,
          componentCount: report.componentCount,
          viewCount: report.viewCount,
          bomItemCount: report.bomItemCount,
        },
      },
      [pdf],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    worker.postMessage({
      type: 'generate-report-error',
      payload: { message },
    });
  }
};

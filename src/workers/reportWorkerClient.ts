import type { ForgeQualityPreset, ReportGenerationResult, ReportObjectVisual } from '@forge/index';
import type { ReportWorkerRequest, ReportWorkerResponse } from './reportWorkerProtocol';
import type { LengthUnit } from '@forge/units';

interface GenerateReportInWorkerOptions {
  files: Record<string, string>;
  activeFile: string;
  paramOverrides: Record<string, number>;
  quality?: ForgeQualityPreset;
  title: string;
  objectVisuals: Record<string, ReportObjectVisual>;
  includeDisassembled: boolean;
  lengthUnit?: LengthUnit;
}

export function generateReportInWorker(options: GenerateReportInWorkerOptions): Promise<ReportGenerationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reportWorker.ts', import.meta.url), { type: 'module' });

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<ReportWorkerResponse>) => {
      const { data } = event;
      cleanup();

      if (data.type === 'generate-report-error') {
        reject(new Error(data.payload.message));
        return;
      }

      resolve({
        pdf: new Uint8Array(data.payload.pdf),
        pageCount: data.payload.pageCount,
        componentCount: data.payload.componentCount,
        viewCount: data.payload.viewCount,
        bomItemCount: data.payload.bomItemCount,
      });
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Report worker failed unexpectedly.'));
    };

    const request: ReportWorkerRequest = {
      type: 'generate-report',
      payload: options,
    };
    worker.postMessage(request);
  });
}

import type { ForgeQualityPreset, ReportObjectVisual } from '@forge/index';

export interface ReportWorkerGeneratePayload {
  files: Record<string, string>;
  activeFile: string;
  paramOverrides: Record<string, number>;
  quality?: ForgeQualityPreset;
  title: string;
  objectVisuals: Record<string, ReportObjectVisual>;
  includeDisassembled: boolean;
}

export interface ReportWorkerGenerateRequest {
  type: 'generate-report';
  payload: ReportWorkerGeneratePayload;
}

export interface ReportWorkerGenerateSuccess {
  type: 'generate-report-success';
  payload: {
    pdf: ArrayBuffer;
    pageCount: number;
    componentCount: number;
    viewCount: number;
    bomItemCount: number;
  };
}

export interface ReportWorkerGenerateError {
  type: 'generate-report-error';
  payload: {
    message: string;
  };
}

export type ReportWorkerRequest = ReportWorkerGenerateRequest;

export type ReportWorkerResponse = ReportWorkerGenerateSuccess | ReportWorkerGenerateError;

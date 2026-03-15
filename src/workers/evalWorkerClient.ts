import type { ForgeQualityPreset } from '@forge/index';
import type {
  EvalWorkerRequest,
  EvalWorkerResponse,
  EvalWorkerFaceInfoResult,
  SerializedRunResult,
} from './evalWorkerProtocol';

interface PendingRun {
  resolve: (result: SerializedRunResult) => void;
  reject: (error: Error) => void;
}

interface PendingFaceInfo {
  resolve: (result: EvalWorkerFaceInfoResult) => void;
  reject: (error: Error) => void;
}

class EvalWorkerClient {
  private worker: Worker | null = null;
  private seq = 0;
  private faceInfoReqId = 0;
  private readonly pendingRuns = new Map<number, PendingRun>();
  private readonly pendingFaceInfo = new Map<number, PendingFaceInfo>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./evalWorker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (event: MessageEvent<EvalWorkerResponse>) => {
      const { data } = event;

      if (data.type === 'run-success' || data.type === 'run-error') {
        const req = this.pendingRuns.get(data.payload.seq);
        if (!req) return; // stale
        this.pendingRuns.delete(data.payload.seq);
        if (data.type === 'run-success') {
          req.resolve(data.payload.result);
        } else {
          req.reject(new Error(data.payload.message));
        }
        return;
      }

      if (data.type === 'face-info-success' || data.type === 'face-info-error') {
        const req = this.pendingFaceInfo.get(data.payload.reqId);
        if (!req) return;
        this.pendingFaceInfo.delete(data.payload.reqId);
        if (data.type === 'face-info-success') {
          req.resolve(data.payload.result);
        } else {
          req.reject(new Error(data.payload.message));
        }
      }
    };

    this.worker.onerror = (event) => {
      const err = new Error(event.message || 'Eval worker crashed');
      for (const req of this.pendingRuns.values()) req.reject(err);
      for (const req of this.pendingFaceInfo.values()) req.reject(err);
      this.pendingRuns.clear();
      this.pendingFaceInfo.clear();
      this.worker = null;
    };

    return this.worker;
  }

  /**
   * Run an eval in the worker. Any in-flight run is cancelled (its promise rejects
   * with 'cancelled'). Only the latest run's result is resolved.
   */
  run(options: {
    code: string;
    file: string;
    files: Record<string, string>;
    quality: ForgeQualityPreset;
    paramOverrides: Record<string, number>;
    isNotebook: boolean;
  }): Promise<SerializedRunResult> {
    for (const req of this.pendingRuns.values()) req.reject(new Error('cancelled'));
    this.pendingRuns.clear();

    const seq = ++this.seq;

    return new Promise<SerializedRunResult>((resolve, reject) => {
      this.pendingRuns.set(seq, { resolve, reject });
      const request: EvalWorkerRequest = { type: 'run', payload: { seq, ...options } };
      this.getWorker().postMessage(request);
    });
  }

  /**
   * Fetch face names, refs, and histories for a specific object from the worker's
   * last RunResult. Called on demand when the face info panel is opened.
   */
  fetchFaceInfo(objectId: string): Promise<EvalWorkerFaceInfoResult> {
    const reqId = ++this.faceInfoReqId;
    return new Promise<EvalWorkerFaceInfoResult>((resolve, reject) => {
      this.pendingFaceInfo.set(reqId, { resolve, reject });
      const request: EvalWorkerRequest = { type: 'face-info', payload: { reqId, objectId } };
      this.getWorker().postMessage(request);
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const req of this.pendingRuns.values()) req.reject(new Error('worker terminated'));
    for (const req of this.pendingFaceInfo.values()) req.reject(new Error('worker terminated'));
    this.pendingRuns.clear();
    this.pendingFaceInfo.clear();
  }
}

export const evalWorkerClient = new EvalWorkerClient();

import type { ForgeQualityPreset } from '@forge/index';
import type { EvalWorkerRequest, EvalWorkerResponse, SerializedRunResult } from './evalWorkerProtocol';

interface PendingRequest {
  resolve: (result: SerializedRunResult) => void;
  reject: (error: Error) => void;
}

class EvalWorkerClient {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, PendingRequest>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./evalWorker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (event: MessageEvent<EvalWorkerResponse>) => {
      const { data } = event;
      const req = this.pending.get(data.payload.seq);
      if (!req) return; // stale response from a cancelled run
      this.pending.delete(data.payload.seq);

      if (data.type === 'run-success') {
        req.resolve(data.payload.result);
      } else {
        req.reject(new Error(data.payload.message));
      }
    };

    this.worker.onerror = (event) => {
      const err = new Error(event.message || 'Eval worker crashed');
      for (const req of this.pending.values()) req.reject(err);
      this.pending.clear();
      this.worker = null; // recreate on next call
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
    // Cancel all in-flight requests
    for (const req of this.pending.values()) {
      req.reject(new Error('cancelled'));
    }
    this.pending.clear();

    const seq = ++this.seq;

    return new Promise<SerializedRunResult>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      const request: EvalWorkerRequest = {
        type: 'run',
        payload: { seq, ...options },
      };
      this.getWorker().postMessage(request);
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const req of this.pending.values()) {
      req.reject(new Error('worker terminated'));
    }
    this.pending.clear();
  }
}

export const evalWorkerClient = new EvalWorkerClient();

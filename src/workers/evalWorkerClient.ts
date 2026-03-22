import type { ForgeQualityPreset } from '@forge/index';
import type {
  EvalWorkerRequest,
  EvalWorkerResponse,
  EvalWorkerFaceInfoResult,
  SerializedRunResult,
  ActiveBackend,
  EvalPhase,
  ExactExportFormat,
} from './evalWorkerProtocol';

interface PendingRun {
  resolve: (result: SerializedRunResult) => void;
  reject: (error: Error) => void;
}

interface PendingFaceInfo {
  resolve: (result: EvalWorkerFaceInfoResult) => void;
  reject: (error: Error) => void;
}

interface PendingExportExact {
  resolve: (blob: ArrayBuffer) => void;
  reject: (error: Error) => void;
}

/** Maximum wall-clock time (ms) for kernel init (WASM loading). */
const INIT_TIMEOUT_MS = 120_000;
/** Maximum wall-clock time (ms) a script evaluation may take. */
const RUN_TIMEOUT_MS = 30_000;
/** Maximum wall-clock time (ms) for export operations (OCCT re-run + STEP/BREP writing). Reset on each progress update. */
const EXPORT_TIMEOUT_MS = 300_000;

class EvalWorkerClient {
  private worker: Worker | null = null;
  private seq = 0;
  private faceInfoReqId = 0;
  private exportReqId = 0;
  private readonly pendingRuns = new Map<number, PendingRun>();
  private readonly pendingFaceInfo = new Map<number, PendingFaceInfo>();
  private readonly pendingExports = new Map<number, PendingExportExact>();
  private runTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private exportTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Called when the worker reports a progress phase change. */
  public onProgress: ((phase: EvalPhase) => void) | null = null;

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./evalWorker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (event: MessageEvent<EvalWorkerResponse>) => {
      const { data } = event;

      if (data.type === 'progress') {
        this.onProgress?.(data.payload.phase);

        // Export progress — reset the export timeout on each phase change
        if (data.payload.phase === 'export-evaluating' || data.payload.phase === 'export-writing') {
          this.resetExportTimeout();
          return;
        }

        // When evaluation starts, switch from the generous init timeout
        // to the shorter run timeout.
        if (data.payload.phase === 'evaluating') {
          this.clearRunTimeout();
          this.runTimeoutId = setTimeout(() => {
            this.killWorker(`Script execution timed out after ${RUN_TIMEOUT_MS / 1000}s`);
          }, RUN_TIMEOUT_MS);
        }
        return;
      }

      if (data.type === 'run-success' || data.type === 'run-error') {
        this.clearRunTimeout();
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
        return;
      }

      if (data.type === 'export-exact-success' || data.type === 'export-exact-error') {
        this.clearExportTimeout();
        const req = this.pendingExports.get(data.payload.reqId);
        if (!req) return;
        this.pendingExports.delete(data.payload.reqId);
        if (data.type === 'export-exact-success') {
          req.resolve(data.payload.blob);
        } else {
          req.reject(new Error(data.payload.message));
        }
      }
    };

    this.worker.onerror = (event) => {
      this.clearRunTimeout();
      this.clearExportTimeout();
      const err = new Error(event.message || 'Eval worker crashed');
      for (const req of this.pendingRuns.values()) req.reject(err);
      for (const req of this.pendingFaceInfo.values()) req.reject(err);
      for (const req of this.pendingExports.values()) req.reject(err);
      this.pendingRuns.clear();
      this.pendingFaceInfo.clear();
      this.pendingExports.clear();
      this.worker = null;
    };

    return this.worker;
  }

  private clearRunTimeout(): void {
    if (this.runTimeoutId !== null) {
      clearTimeout(this.runTimeoutId);
      this.runTimeoutId = null;
    }
  }

  private clearExportTimeout(): void {
    if (this.exportTimeoutId !== null) {
      clearTimeout(this.exportTimeoutId);
      this.exportTimeoutId = null;
    }
  }

  private resetExportTimeout(): void {
    this.clearExportTimeout();
    this.exportTimeoutId = setTimeout(() => {
      // Only reject export requests — don't kill the worker for export timeout
      const err = new Error(`Export timed out after ${EXPORT_TIMEOUT_MS / 1000}s`);
      for (const req of this.pendingExports.values()) req.reject(err);
      this.pendingExports.clear();
    }, EXPORT_TIMEOUT_MS);
  }

  /**
   * Kill the current worker and reject all pending requests.
   * A fresh worker is created lazily on the next `run()` or `fetchFaceInfo()`.
   */
  private killWorker(reason: string): void {
    console.warn(`[evalWorkerClient] ${reason} — terminating worker`);
    this.clearRunTimeout();
    this.clearExportTimeout();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    const err = new Error(reason);
    for (const req of this.pendingRuns.values()) req.reject(err);
    for (const req of this.pendingFaceInfo.values()) req.reject(err);
    for (const req of this.pendingExports.values()) req.reject(err);
    this.pendingRuns.clear();
    this.pendingFaceInfo.clear();
    this.pendingExports.clear();
  }

  /**
   * Run an eval in the worker. Any in-flight run is cancelled (its promise rejects
   * with 'cancelled'). Only the latest run's result is resolved.
   *
   * A generous init timeout (120s) covers WASM loading. Once the worker signals
   * 'evaluating', a shorter run timeout (30s) takes over.
   */
  run(options: {
    code: string;
    file: string;
    files: Record<string, string>;
    quality: ForgeQualityPreset;
    paramOverrides: Record<string, number>;
    isNotebook: boolean;
    activeBackend: ActiveBackend;
  }): Promise<SerializedRunResult> {
    for (const req of this.pendingRuns.values()) req.reject(new Error('cancelled'));
    this.pendingRuns.clear();
    this.clearRunTimeout();

    const seq = ++this.seq;

    return new Promise<SerializedRunResult>((resolve, reject) => {
      this.pendingRuns.set(seq, { resolve, reject });

      // Start with generous init timeout — replaced by run timeout
      // once worker signals 'evaluating' phase.
      this.runTimeoutId = setTimeout(() => {
        this.killWorker(`Kernel initialization timed out after ${INIT_TIMEOUT_MS / 1000}s`);
      }, INIT_TIMEOUT_MS);

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

  /**
   * Export exact geometry (STEP or BREP) via the worker.
   * If the worker doesn't have OCCT shapes cached, it re-runs the script with OCCT backend.
   * Uses a generous 5-minute timeout that resets on each progress update.
   */
  exportExact(options: {
    format: ExactExportFormat;
    code: string;
    file: string;
    files: Record<string, string>;
    quality: ForgeQualityPreset;
    paramOverrides: Record<string, number>;
    isNotebook: boolean;
  }): Promise<ArrayBuffer> {
    const reqId = ++this.exportReqId;

    return new Promise<ArrayBuffer>((resolve, reject) => {
      this.pendingExports.set(reqId, { resolve, reject });

      // Start export timeout
      this.resetExportTimeout();

      const request: EvalWorkerRequest = {
        type: 'export-exact',
        payload: { reqId, ...options },
      };
      this.getWorker().postMessage(request);
    });
  }

  terminate(): void {
    this.clearRunTimeout();
    this.clearExportTimeout();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const req of this.pendingRuns.values()) req.reject(new Error('worker terminated'));
    for (const req of this.pendingFaceInfo.values()) req.reject(new Error('worker terminated'));
    for (const req of this.pendingExports.values()) req.reject(new Error('worker terminated'));
    this.pendingRuns.clear();
    this.pendingFaceInfo.clear();
    this.pendingExports.clear();
  }
}

export const evalWorkerClient = new EvalWorkerClient();

/**
 * Thin JSON/WASM boundary for the Rust constraint solver.
 *
 * This file exists only to initialize wasm, serialize problems, and apply Rust results.
 *
 * Usage:
 * - call `initSolverWasm()` once at startup
 * - use `solveConstraintsWasm()` / presolve helpers after init
 * - use `globalThis.__forgecadSolver` in the browser console for timing and capture helpers
 * - build the WASM artifact with `npm run build:solver`
 */

import type { ConstraintDefinition, SolveOptions, SolverMetadata } from './types';

// ─── Serialisation types (mirror Rust types.rs) ───────────────────────────────

interface WasmPoint {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
}

interface WasmLine {
  id: string;
  a: string;
  b: string;
}

interface WasmCircle {
  id: string;
  center: string;
  radius: number;
  fixed_radius: boolean;
}

interface WasmArc {
  id: string;
  center: string;
  start: string;
  end: string;
  radius: number;
  clockwise: boolean;
}

interface WasmShape {
  id: string;
  lines: string[];
}

interface WasmOptions {
  iterations?: number;
  tolerance?: number;
  restarts?: number;
  warm_start_iterations?: number;
  max_scaled_step?: number;
  skip_redundancy_check?: boolean;
}

interface WasmProblem {
  points: WasmPoint[];
  lines: WasmLine[];
  circles: WasmCircle[];
  arcs: WasmArc[];
  shapes: WasmShape[];
  constraints: object[];
  options?: WasmOptions;
}

interface WasmPointResult {
  id: string;
  x: number;
  y: number;
}

interface WasmCircleResult {
  id: string;
  radius: number;
}

interface WasmArcResult {
  id: string;
  radius: number;
}

interface WasmSolveResult {
  max_error: number;
  points: WasmPointResult[];
  circles: WasmCircleResult[];
  arcs: WasmArcResult[];
  metadata?: WasmSolveMetadata;
}

interface WasmConstraintResidual {
  id: string;
  residual: number;
}

interface WasmSolveMetadata {
  status: 'under' | 'fully' | 'over' | 'over-redundant';
  dof: number;
  constraint_residuals: WasmConstraintResidual[];
  redundant_constraint_ids: string[];
  conflicting_constraint_ids: string[];
}

export type SolverWasmExchangeKind = 'solve' | 'presolve' | 'presolve-single';

export interface SolverWasmTimings {
  serialize: number;
  stringify: number;
  wasm: number;
  parse: number;
  apply: number;
  total: number;
}

export interface SolverWasmExchangeSummary {
  id: number;
  kind: SolverWasmExchangeKind;
  source: string;
  constraintId?: string;
  timings: SolverWasmTimings;
  points: number;
  lines: number;
  circles: number;
  arcs: number;
  shapes: number;
  constraints: number;
  requestBytes: number;
  responseBytes: number;
  maxError?: number;
  status?: WasmSolveMetadata['status'];
  error?: string;
}

export interface SolverWasmExchangeRecord extends SolverWasmExchangeSummary {
  requestJson: string;
  responseJson: string;
}

interface SolverWasmTimingAccumulator {
  calls: number;
  serialize: number;
  stringify: number;
  wasm: number;
  parse: number;
  apply: number;
  total: number;
  requestBytes: number;
  responseBytes: number;
}

export interface SolverWasmStats {
  consoleDebug: boolean;
  totals: SolverWasmTimingAccumulator;
  byKind: Partial<Record<SolverWasmExchangeKind, SolverWasmTimingAccumulator>>;
  bySource: Record<string, SolverWasmTimingAccumulator>;
  history: SolverWasmExchangeSummary[];
}

export interface SolverWasmRunDebugSnapshot {
  stats: SolverWasmStats;
  lastExchange: SolverWasmExchangeRecord | null;
  lastSolveExchange: SolverWasmExchangeRecord | null;
  lastExchangeBundleJson: string | null;
  lastSolveExchangeBundleJson: string | null;
}

// ─── WASM module state ────────────────────────────────────────────────────────

type WasmSolveFn = (problem_json: string) => string;

let _wasm_solve: WasmSolveFn | null = null;
let _wasm_presolve: WasmSolveFn | null = null;
let _wasm_presolve_single: ((problem_json: string, constraint_id: string) => string) | null = null;
let _initPromise: Promise<void> | null = null;
const MAX_EXCHANGE_HISTORY = 64;
const DEBUG_STORAGE_KEY = 'fc:solver-debug';
let _consoleDebug = readInitialConsoleDebug();
let _exchangeCounter = 0;
let _lastExchange: SolverWasmExchangeRecord | null = null;
let _lastPublishedRunDebug: SolverWasmRunDebugSnapshot | null = null;
const _exchangeHistory: SolverWasmExchangeRecord[] = [];
const _totals = createAccumulator();
const _byKind = new Map<SolverWasmExchangeKind, SolverWasmTimingAccumulator>();
const _bySource = new Map<string, SolverWasmTimingAccumulator>();

type SolverWasmDebugHandle = {
  enableConsoleDebug: () => SolverWasmStats;
  disableConsoleDebug: () => SolverWasmStats;
  isConsoleDebugEnabled: () => boolean;
  reset: () => SolverWasmStats;
  resetStats: () => SolverWasmStats;
  getStats: () => SolverWasmStats;
  getHistory: (limit?: number) => SolverWasmExchangeSummary[];
  printRecent: (limit?: number) => SolverWasmExchangeSummary[];
  getLastExchange: (kind?: SolverWasmExchangeKind) => SolverWasmExchangeRecord | null;
  lastExchange: SolverWasmExchangeRecord | null;
  lastSolveExchange: SolverWasmExchangeRecord | null;
  lastRun: SolverWasmRunDebugSnapshot | null;
  printLastExchange: (kind?: SolverWasmExchangeKind) => string | null;
  copyLastExchange: (kind?: SolverWasmExchangeKind) => Promise<string | null>;
  copyLastRequest: (kind?: SolverWasmExchangeKind) => Promise<string | null>;
  copyLastResponse: (kind?: SolverWasmExchangeKind) => Promise<string | null>;
};

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function readInitialConsoleDebug(): boolean {
  if (readEnvFlag('FORGECAD_SOLVER_DEBUG')) return true;
  if (readBrowserFlag(DEBUG_STORAGE_KEY)) return true;
  if (typeof location !== 'undefined') {
    try {
      return new URLSearchParams(location.search).get('solverDebug') === '1';
    } catch {
      return false;
    }
  }
  return false;
}

function readEnvFlag(name: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readBrowserFlag(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function persistConsoleDebug(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) {
      localStorage.setItem(DEBUG_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures in private mode / Node.
  }
}

function createAccumulator(): SolverWasmTimingAccumulator {
  return {
    calls: 0,
    serialize: 0,
    stringify: 0,
    wasm: 0,
    parse: 0,
    apply: 0,
    total: 0,
    requestBytes: 0,
    responseBytes: 0,
  };
}

function updateAccumulator(
  acc: SolverWasmTimingAccumulator,
  timings: SolverWasmTimings,
  requestBytes: number,
  responseBytes: number,
): void {
  acc.calls += 1;
  acc.serialize += timings.serialize;
  acc.stringify += timings.stringify;
  acc.wasm += timings.wasm;
  acc.parse += timings.parse;
  acc.apply += timings.apply;
  acc.total += timings.total;
  acc.requestBytes += requestBytes;
  acc.responseBytes += responseBytes;
}

function cloneAccumulator(acc: SolverWasmTimingAccumulator): SolverWasmTimingAccumulator {
  return { ...acc };
}

function formatMs(ms: number): string {
  return `${ms >= 100 ? ms.toFixed(0) : ms.toFixed(1)}ms`;
}

function formatSolverWasmExchange(record: SolverWasmExchangeRecord): string {
  const request = JSON.parse(record.requestJson);
  const response = JSON.parse(record.responseJson);
  return JSON.stringify({
    kind: record.kind,
    constraint_id: record.constraintId,
    request,
    response,
  }, null, 2);
}

function findLastExchange(kind?: SolverWasmExchangeKind): SolverWasmExchangeRecord | null {
  if (!kind) return _lastExchange;
  for (let i = _exchangeHistory.length - 1; i >= 0; i -= 1) {
    if (_exchangeHistory[i].kind === kind) return _exchangeHistory[i];
  }
  return _lastExchange?.kind === kind ? _lastExchange : null;
}

async function copyText(text: string): Promise<void> {
  if (
    typeof navigator !== 'undefined'
    && 'clipboard' in navigator
    && navigator.clipboard
    && typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(text);
  }
}

function recordExchange(record: SolverWasmExchangeRecord): void {
  _lastExchange = record;
  _exchangeHistory.push(record);
  if (_exchangeHistory.length > MAX_EXCHANGE_HISTORY) {
    _exchangeHistory.shift();
  }

  updateAccumulator(_totals, record.timings, record.requestBytes, record.responseBytes);

  const byKind = _byKind.get(record.kind) ?? createAccumulator();
  updateAccumulator(byKind, record.timings, record.requestBytes, record.responseBytes);
  _byKind.set(record.kind, byKind);

  const bySource = _bySource.get(record.source) ?? createAccumulator();
  updateAccumulator(bySource, record.timings, record.requestBytes, record.responseBytes);
  _bySource.set(record.source, bySource);

  if (_consoleDebug) {
    const err = record.error ? ` error=${record.error}` : '';
    const constraint = record.constraintId ? ` constraint=${record.constraintId}` : '';
    const status = record.status ? ` status=${record.status}` : '';
    const maxError = typeof record.maxError === 'number' ? ` maxErr=${record.maxError.toExponential(2)}` : '';
    console.log(
      `[solver-wasm] #${record.id} ${record.source} ${record.kind}${constraint}`
      + ` total=${formatMs(record.timings.total)} wasm=${formatMs(record.timings.wasm)}`
      + ` serialize=${formatMs(record.timings.serialize)} stringify=${formatMs(record.timings.stringify)}`
      + ` parse=${formatMs(record.timings.parse)} apply=${formatMs(record.timings.apply)}`
      + ` req=${record.requestBytes}B res=${record.responseBytes}B`
      + ` constraints=${record.constraints}${status}${maxError}${err}`,
    );
  }
}

export function setSolverWasmConsoleDebug(enabled: boolean): SolverWasmStats {
  _consoleDebug = enabled;
  persistConsoleDebug(enabled);
  return getSolverWasmStats();
}

export function isSolverWasmConsoleDebugEnabled(): boolean {
  return _consoleDebug;
}

export function resetSolverWasmStats(): SolverWasmStats {
  Object.assign(_totals, createAccumulator());
  _byKind.clear();
  _bySource.clear();
  _exchangeHistory.length = 0;
  _lastExchange = null;
  return getSolverWasmStats();
}

export function getSolverWasmStats(): SolverWasmStats {
  return {
    consoleDebug: _consoleDebug,
    totals: cloneAccumulator(_totals),
    byKind: Object.fromEntries(
      [..._byKind.entries()].map(([kind, acc]) => [kind, cloneAccumulator(acc)]),
    ) as Partial<Record<SolverWasmExchangeKind, SolverWasmTimingAccumulator>>,
    bySource: Object.fromEntries(
      [..._bySource.entries()].map(([source, acc]) => [source, cloneAccumulator(acc)]),
    ),
    history: _exchangeHistory.map((record) => ({
      id: record.id,
      kind: record.kind,
      source: record.source,
      constraintId: record.constraintId,
      timings: { ...record.timings },
      points: record.points,
      lines: record.lines,
      circles: record.circles,
      arcs: record.arcs,
      shapes: record.shapes,
      constraints: record.constraints,
      requestBytes: record.requestBytes,
      responseBytes: record.responseBytes,
      maxError: record.maxError,
      status: record.status,
      error: record.error,
    })),
  };
}

export function getSolverWasmExchangeHistory(limit = 20): SolverWasmExchangeSummary[] {
  return getSolverWasmStats().history.slice(-limit);
}

export function getLastSolverWasmExchange(kind?: SolverWasmExchangeKind): SolverWasmExchangeRecord | null {
  return findLastExchange(kind);
}

export function getSolverWasmRunDebugSnapshot(): SolverWasmRunDebugSnapshot {
  const lastExchange = getLastSolverWasmExchange();
  const lastSolveExchange = getLastSolverWasmExchange('solve');
  return {
    stats: getSolverWasmStats(),
    lastExchange,
    lastSolveExchange,
    lastExchangeBundleJson: lastExchange ? formatSolverWasmExchange(lastExchange) : null,
    lastSolveExchangeBundleJson: lastSolveExchange ? formatSolverWasmExchange(lastSolveExchange) : null,
  };
}

export function publishSolverWasmRunDebug(snapshot: SolverWasmRunDebugSnapshot | null): void {
  _lastPublishedRunDebug = snapshot;
  if (!snapshot || typeof window === 'undefined') return;

  const totals = snapshot.stats.totals;
  const lastSolve = snapshot.lastSolveExchange;
  const header =
    `[forgecad solver] ${totals.calls} Rust calls`
    + ` | boundary=${formatMs(totals.total)}`
    + ` | rust/wasm=${formatMs(totals.wasm)}`
    + (lastSolve ? ` | last solve rust/wasm=${formatMs(lastSolve.timings.wasm)}` : '');

  if (typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(header);
    console.log('window.__forgecadSolver.lastRun', snapshot);
    if (snapshot.lastSolveExchangeBundleJson) {
      console.log('window.__forgecadSolver.lastRun.lastSolveExchangeBundleJson');
      console.log(snapshot.lastSolveExchangeBundleJson);
    }
    console.groupEnd();
  } else {
    console.log(header);
    console.log(snapshot);
  }
}

export function printLastSolverWasmExchange(kind: SolverWasmExchangeKind = 'solve'): string | null {
  const record = findLastExchange(kind);
  if (!record) return null;
  const text = formatSolverWasmExchange(record);
  console.log(text);
  return text;
}

export async function copyLastSolverWasmExchange(kind: SolverWasmExchangeKind = 'solve'): Promise<string | null> {
  const record = findLastExchange(kind);
  if (!record) return null;
  const text = formatSolverWasmExchange(record);
  await copyText(text);
  return text;
}

export async function copyLastSolverWasmRequest(kind: SolverWasmExchangeKind = 'solve'): Promise<string | null> {
  const record = findLastExchange(kind);
  if (!record) return null;
  await copyText(record.requestJson);
  return record.requestJson;
}

export async function copyLastSolverWasmResponse(kind: SolverWasmExchangeKind = 'solve'): Promise<string | null> {
  const record = findLastExchange(kind);
  if (!record) return null;
  await copyText(record.responseJson);
  return record.responseJson;
}

function installDebugHandle(): void {
  const handle = {} as SolverWasmDebugHandle;
  Object.defineProperties(handle, {
    lastExchange: {
      get: () => getLastSolverWasmExchange(),
      enumerable: true,
    },
    lastSolveExchange: {
      get: () => getLastSolverWasmExchange('solve'),
      enumerable: true,
    },
    lastRun: {
      get: () => _lastPublishedRunDebug,
      enumerable: true,
    },
  });
  Object.assign(handle, {
    enableConsoleDebug: () => setSolverWasmConsoleDebug(true),
    disableConsoleDebug: () => setSolverWasmConsoleDebug(false),
    isConsoleDebugEnabled: () => isSolverWasmConsoleDebugEnabled(),
    reset: () => resetSolverWasmStats(),
    resetStats: () => resetSolverWasmStats(),
    getStats: () => getSolverWasmStats(),
    getHistory: (limit = 20) => getSolverWasmExchangeHistory(limit),
    printRecent: (limit = 20) => {
      const history = getSolverWasmExchangeHistory(limit);
      if (typeof console.table === 'function') {
        console.table(history.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          source: entry.source,
          constraintId: entry.constraintId ?? '',
          totalMs: Number(entry.timings.total.toFixed(3)),
          wasmMs: Number(entry.timings.wasm.toFixed(3)),
          constraints: entry.constraints,
          maxError: entry.maxError == null ? '' : Number(entry.maxError.toPrecision(4)),
          status: entry.status ?? '',
          error: entry.error ?? '',
        })));
      } else {
        console.log(history);
      }
      return history;
    },
    getLastExchange: (kind: SolverWasmExchangeKind = 'solve') => getLastSolverWasmExchange(kind),
    printLastExchange: (kind: SolverWasmExchangeKind = 'solve') => printLastSolverWasmExchange(kind),
    copyLastExchange: (kind: SolverWasmExchangeKind = 'solve') => copyLastSolverWasmExchange(kind),
    copyLastRequest: (kind: SolverWasmExchangeKind = 'solve') => copyLastSolverWasmRequest(kind),
    copyLastResponse: (kind: SolverWasmExchangeKind = 'solve') => copyLastSolverWasmResponse(kind),
  });
  (globalThis as Record<string, unknown>).__forgecadSolver = handle;
}

installDebugHandle();

/**
 * Initialise the WASM module. Safe to call multiple times — subsequent calls
 * return the same promise. Call this once early in app startup.
 */
export async function initSolverWasm(): Promise<void> {
  if (_wasm_solve) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      // Dynamic import so Vite can handle the WASM file as an asset.
      const solverModule = await import(
        /* webpackChunkName: "solver-wasm" */
        '../../../../solver/pkg/solver.js'
      );

      // In Node.js, the wasm-pack --target web init() uses fetch() which
      // doesn't work for local files. Load the WASM bytes manually instead.
      const isNode = typeof process !== 'undefined' && process.versions?.node;
      if (isNode) {
        const { readFileSync, existsSync } = await import('fs');
        const { resolve, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        // Walk up from the current file to find the project root (contains solver/pkg/).
        let dir = dirname(fileURLToPath(import.meta.url));
        let wasmPath = '';
        for (let i = 0; i < 10; i++) {
          const candidate = resolve(dir, 'solver', 'pkg', 'solver_bg.wasm');
          if (existsSync(candidate)) { wasmPath = candidate; break; }
          const parent = dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
        if (!wasmPath) throw new Error('solver_bg.wasm not found — run: npm run build:solver');
        const wasmBytes = readFileSync(wasmPath);
        await solverModule.default(wasmBytes);
      } else {
        await solverModule.default();
      }

      _wasm_solve = solverModule.solve as WasmSolveFn;
      _wasm_presolve = solverModule.presolve as WasmSolveFn;
      _wasm_presolve_single = solverModule.presolve_single as (problem_json: string, constraint_id: string) => string;
    } catch (err) {
      throw new Error(
        `[solver-wasm] Failed to load WASM solver.\n` +
        `  Build it with: npm run build:solver\n` +
        `  (or run "npm run dev" which auto-builds)\n` +
        `  Original error: ${err instanceof Error ? err.message : err}`,
      );
    }
  })();

  return _initPromise;
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

/**
 * Convert a ConstraintDefinition to the flat JSON format expected by the Rust solver.
 * The Rust solver uses snake_case for struct fields (via serde rename).
 */
function serializeProblem(def: ConstraintDefinition, options: SolveOptions): WasmProblem {
  return {
    points: def.points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      fixed: p.fixed,
    })),
    lines: def.lines.map((l) => ({
      id: l.id,
      a: l.a,
      b: l.b,
    })),
    circles: def.circles.map((c) => ({
      id: c.id,
      center: c.center,
      radius: c.radius,
      fixed_radius: c.fixedRadius,
    })),
    arcs: (def.arcs ?? []).map((a) => ({
      id: a.id,
      center: a.center,
      start: a.start,
      end: a.end,
      radius: a.radius,
      clockwise: a.clockwise,
    })),
    shapes: (def.shapes ?? []).map((s) => ({
      id: s.id,
      lines: s.lines,
    })),
    // Pass constraints as raw JSON — the Rust side uses serde's discriminated union
    // with `type` as the tag.  TypeScript constraint objects already have a `type` field.
    constraints: def.constraints.map(serializeConstraint),
    options: {
      iterations: options.iterations,
      tolerance: options.tolerance,
      restarts: options.restarts,
      warm_start_iterations: options.warmStartIterations,
      max_scaled_step: options.maxScaledStep,
      skip_redundancy_check: options.skipRedundancyCheck,
    },
  };
}

/**
 * Serialize a TypeScript constraint to the Rust wire format.
 * Most fields pass through directly.  A few need renaming for snake_case.
 */
function serializeConstraint(c: object): object {
  const raw = c as Record<string, unknown>;
  // Most constraints are pass-through, but we need to handle at_start → atStart rename.
  if (raw['type'] === 'lineTangentArc') {
    return { ...raw, at_start: raw['atStart'] };
  }
  return raw;
}

/**
 * Apply the WASM solve result back to the ConstraintDefinition in place.
 */
function applyResult(def: ConstraintDefinition, result: WasmSolveResult): void {
  const pointMap = new Map(def.points.map((p) => [p.id, p]));
  const circleMap = new Map(def.circles.map((c) => [c.id, c]));
  const arcMap = new Map((def.arcs ?? []).map((a) => [a.id, a]));

  for (const { id, x, y } of result.points) {
    const p = pointMap.get(id);
    if (p && !p.fixed) { p.x = x; p.y = y; }
  }
  for (const { id, radius } of result.circles) {
    const c = circleMap.get(id);
    if (c && !c.fixedRadius) { c.radius = radius; }
  }
  for (const { id, radius } of result.arcs) {
    const a = arcMap.get(id);
    if (a) { a.radius = radius; }
  }
}

function toSolverMetadata(result: WasmSolveResult): SolverMetadata | null {
  return result.metadata ? {
    status: result.metadata.status,
    dof: result.metadata.dof,
    constraintResiduals: result.metadata.constraint_residuals.map((entry) => ({
      id: entry.id,
      residual: entry.residual,
    })),
    redundantConstraintIds: result.metadata.redundant_constraint_ids,
    conflictingConstraintIds: result.metadata.conflicting_constraint_ids,
  } : null;
}

function runWasmCall<TResult>(
  def: ConstraintDefinition,
  options: SolveOptions,
  params: {
    kind: SolverWasmExchangeKind;
    source: string;
    constraintId?: string;
    invoke: (requestJson: string) => string;
    sentinelError: string;
    parseError: string;
    finalize: (result: WasmSolveResult) => TResult;
  },
): TResult {
  const id = ++_exchangeCounter;
  const t0 = nowMs();
  const problem = serializeProblem(def, options);
  const t1 = nowMs();
  const requestJson = JSON.stringify(problem);
  const t2 = nowMs();

  let responseJson = '';
  try {
    responseJson = params.invoke(requestJson);
  } catch (err) {
    const t3 = nowMs();
    recordExchange({
      id,
      kind: params.kind,
      source: params.source,
      constraintId: params.constraintId,
      timings: {
        serialize: t1 - t0,
        stringify: t2 - t1,
        wasm: t3 - t2,
        parse: 0,
        apply: 0,
        total: t3 - t0,
      },
      points: problem.points.length,
      lines: problem.lines.length,
      circles: problem.circles.length,
      arcs: problem.arcs.length,
      shapes: problem.shapes.length,
      constraints: problem.constraints.length,
      requestBytes: requestJson.length,
      responseBytes: 0,
      error: err instanceof Error ? err.message : String(err),
      requestJson,
      responseJson,
    });
    throw err;
  }
  const t3 = nowMs();

  let result: WasmSolveResult;
  try {
    result = JSON.parse(responseJson) as WasmSolveResult;
  } catch {
    const t4 = nowMs();
    recordExchange({
      id,
      kind: params.kind,
      source: params.source,
      constraintId: params.constraintId,
      timings: {
        serialize: t1 - t0,
        stringify: t2 - t1,
        wasm: t3 - t2,
        parse: t4 - t3,
        apply: 0,
        total: t4 - t0,
      },
      points: problem.points.length,
      lines: problem.lines.length,
      circles: problem.circles.length,
      arcs: problem.arcs.length,
      shapes: problem.shapes.length,
      constraints: problem.constraints.length,
      requestBytes: requestJson.length,
      responseBytes: responseJson.length,
      error: params.parseError,
      requestJson,
      responseJson,
    });
    throw new Error(params.parseError);
  }
  const t4 = nowMs();

  if (result.max_error === 1e308) {
    recordExchange({
      id,
      kind: params.kind,
      source: params.source,
      constraintId: params.constraintId,
      timings: {
        serialize: t1 - t0,
        stringify: t2 - t1,
        wasm: t3 - t2,
        parse: t4 - t3,
        apply: 0,
        total: t4 - t0,
      },
      points: problem.points.length,
      lines: problem.lines.length,
      circles: problem.circles.length,
      arcs: problem.arcs.length,
      shapes: problem.shapes.length,
      constraints: problem.constraints.length,
      requestBytes: requestJson.length,
      responseBytes: responseJson.length,
      maxError: result.max_error,
      status: result.metadata?.status,
      error: params.sentinelError,
      requestJson,
      responseJson,
    });
    throw new Error(params.sentinelError);
  }

  const value = params.finalize(result);
  const t5 = nowMs();
  recordExchange({
    id,
    kind: params.kind,
    source: params.source,
    constraintId: params.constraintId,
    timings: {
      serialize: t1 - t0,
      stringify: t2 - t1,
      wasm: t3 - t2,
      parse: t4 - t3,
      apply: t5 - t4,
      total: t5 - t0,
    },
    points: problem.points.length,
    lines: problem.lines.length,
    circles: problem.circles.length,
    arcs: problem.arcs.length,
    shapes: problem.shapes.length,
    constraints: problem.constraints.length,
    requestBytes: requestJson.length,
    responseBytes: responseJson.length,
    maxError: result.max_error,
    status: result.metadata?.status,
    requestJson,
    responseJson,
  });
  return value;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Solve a constraint system using the Rust/WASM solver.
 * Updates `def` in place and returns `{ maxError }`.
 * Throws if WASM is not initialised (call `initSolverWasm()` first).
 */
export function solveConstraintsWasm(
  def: ConstraintDefinition,
  options: SolveOptions,
  source = 'solveConstraintsWasm',
): { maxError: number; metadata: SolverMetadata | null } {
  if (!_wasm_solve) {
    throw new Error('[solver-wasm] WASM solver not initialised — build it with: npm run build:solver');
  }
  return runWasmCall(def, options, {
    kind: 'solve',
    source,
    invoke: (requestJson) => _wasm_solve!(requestJson),
    sentinelError: '[solver-wasm] WASM solver failed to parse problem JSON',
    parseError: '[solver-wasm] WASM solver returned invalid JSON',
    finalize: (result) => {
      applyResult(def, result);
      return {
        maxError: result.max_error,
        metadata: toSolverMetadata(result),
      };
    },
  });
}

/**
 * Run only the Rust presolve stages.
 * Updates `def` in place and returns `{ maxError }`.
 */
export function presolveConstraintsWasm(
  def: ConstraintDefinition,
  options: SolveOptions,
  source = 'presolveConstraintsWasm',
): { maxError: number } {
  if (!_wasm_presolve) {
    throw new Error('[solver-wasm] WASM solver not initialised — build it with: npm run build:solver');
  }
  return runWasmCall(def, options, {
    kind: 'presolve',
    source,
    invoke: (requestJson) => _wasm_presolve!(requestJson),
    sentinelError: '[solver-wasm] WASM presolve failed to parse problem JSON',
    parseError: '[solver-wasm] WASM presolve returned invalid JSON',
    finalize: (result) => {
      applyResult(def, result);
      return { maxError: result.max_error };
    },
  });
}

/**
 * Run the Rust presolve hook for a single newly-added constraint.
 * Updates `def` in place and returns `{ maxError }`.
 */
export function presolveSingleConstraintWasm(
  def: ConstraintDefinition,
  constraintId: string,
  options: SolveOptions,
  source = 'presolveSingleConstraintWasm',
): { maxError: number } {
  if (!_wasm_presolve_single) {
    throw new Error('[solver-wasm] WASM solver not initialised — build it with: npm run build:solver');
  }
  return runWasmCall(def, options, {
    kind: 'presolve-single',
    source,
    constraintId,
    invoke: (requestJson) => _wasm_presolve_single!(requestJson, constraintId),
    sentinelError: '[solver-wasm] WASM single-constraint presolve failed to parse problem JSON',
    parseError: '[solver-wasm] WASM single-constraint presolve returned invalid JSON',
    finalize: (result) => {
      applyResult(def, result);
      return { maxError: result.max_error };
    },
  });
}

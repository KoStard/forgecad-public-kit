/**
 * TypeScript bridge to the Rust/WASM constraint solver.
 *
 * Usage:
 *   - Call `initSolverWasm()` once at startup (e.g., in a worker or at app boot).
 *   - The exported `solveConstraintsWasm()` is a drop-in replacement for
 *     `solveConstraints()` from registry.ts when WASM is ready.
 *   - Falls back to null if WASM is not initialised yet (caller must handle).
 */

import type { ConstraintDefinition, SolveOptions } from './types';

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
}

// ─── WASM module state ────────────────────────────────────────────────────────

type WasmSolveFn = (problem_json: string) => string;

let _wasm_solve: WasmSolveFn | null = null;
let _initPromise: Promise<void> | null = null;

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
      await solverModule.default();
      _wasm_solve = solverModule.solve as WasmSolveFn;
    } catch (err) {
      console.warn('[solver-wasm] failed to load WASM solver, falling back to TypeScript solver:', err);
      _wasm_solve = null;
    }
  })();

  return _initPromise;
}

/** True once WASM has been initialised successfully. */
export function isSolverWasmReady(): boolean {
  return _wasm_solve !== null;
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Solve a constraint system using the Rust/WASM solver.
 *
 * Returns `null` if the WASM module is not yet initialised (caller should fall
 * back to the TypeScript solver).
 *
 * On success, updates `def` in place and returns `{ maxError }`.
 */
export function solveConstraintsWasm(
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number } | null {
  if (!_wasm_solve) return null;

  const problem = serializeProblem(def, options);
  const resultJson = _wasm_solve(JSON.stringify(problem));
  const result: WasmSolveResult = JSON.parse(resultJson);

  if (result.max_error === 1e308) {
    // Sentinel: WASM parse error — fall back to TS solver.
    return null;
  }

  applyResult(def, result);
  return { maxError: result.max_error };
}

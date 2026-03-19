/**
 * Thin JSON/WASM boundary for the Rust constraint solver.
 *
 * This file exists only to initialize wasm, serialize problems, and apply Rust results.
 *
 * Usage:
 * - call `initSolverWasm()` once at startup
 * - use `solveConstraintsWasm()` / presolve helpers after init
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

// ─── WASM module state ────────────────────────────────────────────────────────

type WasmSolveFn = (problem_json: string) => string;

let _wasm_solve: WasmSolveFn | null = null;
let _wasm_presolve: WasmSolveFn | null = null;
let _wasm_presolve_single: ((problem_json: string, constraint_id: string) => string) | null = null;
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Solve a constraint system using the Rust/WASM solver.
 * Updates `def` in place and returns `{ maxError }`.
 * Throws if WASM is not initialised (call `initSolverWasm()` first).
 */
export function solveConstraintsWasm(
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number; metadata: SolverMetadata | null } {
  if (!_wasm_solve) {
    throw new Error('[solver-wasm] WASM solver not initialised — build it with: npm run build:solver');
  }

  const problem = serializeProblem(def, options);
  const resultJson = _wasm_solve(JSON.stringify(problem));
  const result: WasmSolveResult = JSON.parse(resultJson);

  if (result.max_error === 1e308) {
    throw new Error('[solver-wasm] WASM solver failed to parse problem JSON');
  }

  applyResult(def, result);
  return {
    maxError: result.max_error,
    metadata: result.metadata ? {
      status: result.metadata.status,
      dof: result.metadata.dof,
      constraintResiduals: result.metadata.constraint_residuals.map((entry) => ({
        id: entry.id,
        residual: entry.residual,
      })),
      redundantConstraintIds: result.metadata.redundant_constraint_ids,
      conflictingConstraintIds: result.metadata.conflicting_constraint_ids,
    } : null,
  };
}

/**
 * Run only the Rust presolve stages.
 * Updates `def` in place and returns `{ maxError }`.
 */
export function presolveConstraintsWasm(
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number } {
  if (!_wasm_presolve) {
    throw new Error('[solver-wasm] WASM solver not initialised — build it with: npm run build:solver');
  }

  const problem = serializeProblem(def, options);
  const resultJson = _wasm_presolve(JSON.stringify(problem));
  const result: WasmSolveResult = JSON.parse(resultJson);

  if (result.max_error === 1e308) {
    throw new Error('[solver-wasm] WASM presolve failed to parse problem JSON');
  }

  applyResult(def, result);
  return { maxError: result.max_error };
}

/**
 * Run the Rust presolve hook for a single newly-added constraint.
 * Updates `def` in place and returns `{ maxError }`.
 */
export function presolveSingleConstraintWasm(
  def: ConstraintDefinition,
  constraintId: string,
  options: SolveOptions,
): { maxError: number } {
  if (!_wasm_presolve_single) {
    throw new Error('[solver-wasm] WASM solver not initialised — build it with: npm run build:solver');
  }

  const problem = serializeProblem(def, options);
  const resultJson = _wasm_presolve_single(JSON.stringify(problem), constraintId);
  const result: WasmSolveResult = JSON.parse(resultJson);

  if (result.max_error === 1e308) {
    throw new Error('[solver-wasm] WASM single-constraint presolve failed to parse problem JSON');
  }

  applyResult(def, result);
  return { maxError: result.max_error };
}

/* tslint:disable */
/* eslint-disable */

/**
 * Return the profiling data from the last solve call as JSON.
 */
export function get_last_profile(): string;

/**
 * Run only the deterministic presolve stages and return the updated geometry.
 */
export function presolve(problem_json: string): string;

/**
 * Run the targeted presolve hook for one constraint and return the updated geometry.
 */
export function presolve_single(problem_json: string, constraint_id: string): string;

/**
 * Add an arc to the session.
 */
export function session_add_arc(handle: number, id: string, center: string, start: string, end: string, radius: number, clockwise: boolean): void;

/**
 * Add a circle to the session.
 */
export function session_add_circle(handle: number, id: string, center: string, radius: number, fixed_radius: boolean): void;

/**
 * Add a constraint to the session and optionally run a seed step.
 * constraint_json is a single serialized Constraint.
 * If seed is true, runs a mini-solve after adding.
 * Returns the max error after the step (or -1 on error).
 */
export function session_add_constraint(handle: number, constraint_json: string, seed: boolean): number;

/**
 * Add a group to the session.
 */
export function session_add_group(handle: number, group_json: string): void;

/**
 * Add a line to the session.
 */
export function session_add_line(handle: number, id: string, a: string, b: string): void;

/**
 * Add a point to the session.
 */
export function session_add_point(handle: number, id: string, x: number, y: number, fixed: boolean): void;

/**
 * Add a shape to the session.
 */
export function session_add_shape(handle: number, id: string, line_ids_json: string): void;

/**
 * Create a new solver session. Returns an opaque handle (u32).
 */
export function session_create(): number;

/**
 * Destroy a solver session and free its memory.
 */
export function session_destroy(handle: number): void;

/**
 * Get the current positions of all points in the session as JSON.
 * Lightweight alternative to session_solve for reading state after seed steps.
 */
export function session_get_points(handle: number): string;

/**
 * Run the full solver on the session's current state.
 * Returns the solve result as JSON (same format as the stateless solve()).
 */
export function session_solve(handle: number, options_json: string): string;

/**
 * Solve a constraint system from JSON.
 */
export function solve(problem_json: string): string;

/**
 * Set up the panic hook once on WASM init so panics surface in the browser console.
 */
export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly get_last_profile: () => [number, number];
    readonly presolve: (a: number, b: number) => [number, number];
    readonly presolve_single: (a: number, b: number, c: number, d: number) => [number, number];
    readonly session_add_arc: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly session_add_circle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly session_add_constraint: (a: number, b: number, c: number, d: number) => number;
    readonly session_add_group: (a: number, b: number, c: number) => void;
    readonly session_add_line: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly session_add_point: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly session_add_shape: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly session_create: () => number;
    readonly session_get_points: (a: number) => [number, number];
    readonly session_solve: (a: number, b: number, c: number) => [number, number];
    readonly solve: (a: number, b: number) => [number, number];
    readonly start: () => void;
    readonly session_destroy: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

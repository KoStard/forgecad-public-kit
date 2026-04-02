/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const get_last_profile: () => [number, number];
export const presolve: (a: number, b: number) => [number, number];
export const presolve_single: (a: number, b: number, c: number, d: number) => [number, number];
export const session_add_arc: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
export const session_add_circle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
export const session_add_constraint: (a: number, b: number, c: number, d: number) => number;
export const session_add_group: (a: number, b: number, c: number) => void;
export const session_add_line: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
export const session_add_point: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
export const session_add_shape: (a: number, b: number, c: number, d: number, e: number) => void;
export const session_create: () => number;
export const session_get_points: (a: number) => [number, number];
export const session_solve: (a: number, b: number, c: number) => [number, number];
export const solve: (a: number, b: number) => [number, number];
export const start: () => void;
export const session_destroy: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_start: () => void;

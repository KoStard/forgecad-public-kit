/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 */

import { Shape, box, cylinder, sphere, union, difference, intersection } from './kernel';
import { param, resetParams, getCollectedParams, type ParamDef } from './params';
import { partLibrary } from './library';

export interface RunResult {
  shape: Shape | null;
  params: ParamDef[];
  error: string | null;
  timeMs: number;
}

export function runScript(code: string): RunResult {
  resetParams();
  const t0 = performance.now();

  try {
    const wrapped = `"use strict";\n${code}`;

    const fn = new Function(
      'box', 'cylinder', 'sphere',
      'union', 'difference', 'intersection',
      'param', 'Shape', 'lib',
      wrapped,
    );

    const result = fn(
      box, cylinder, sphere,
      union, difference, intersection,
      param, Shape, partLibrary,
    );

    const shape = result instanceof Shape ? result : null;
    return {
      shape,
      params: getCollectedParams(),
      error: shape ? null : 'Script must return a Shape (use box(), cylinder(), etc.)',
      timeMs: performance.now() - t0,
    };
  } catch (e: any) {
    return {
      shape: null,
      params: getCollectedParams(),
      error: e.message || String(e),
      timeMs: performance.now() - t0,
    };
  }
}

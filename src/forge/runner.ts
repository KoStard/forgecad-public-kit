/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 */

import { Shape, box, cylinder, sphere, union, difference, intersection } from './kernel';
import { Sketch, rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, union2d, difference2d, intersection2d, hull2d } from './sketch';
import { param, resetParams, getCollectedParams, type ParamDef } from './params';
import { partLibrary } from './library';

export interface RunResult {
  shape: Shape | null;
  sketch: Sketch | null;
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
      // 3D
      'box', 'cylinder', 'sphere',
      'union', 'difference', 'intersection',
      // 2D
      'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star',
      'union2d', 'difference2d', 'intersection2d', 'hull2d',
      // Classes
      'param', 'Shape', 'Sketch', 'lib',
      wrapped,
    );

    const result = fn(
      box, cylinder, sphere,
      union, difference, intersection,
      rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star,
      union2d, difference2d, intersection2d, hull2d,
      param, Shape, Sketch, partLibrary,
    );

    const shape = result instanceof Shape ? result : null;
    const sketch = result instanceof Sketch ? result : null;

    return {
      shape,
      sketch,
      params: getCollectedParams(),
      error: (shape || sketch) ? null : 'Script must return a Shape or Sketch',
      timeMs: performance.now() - t0,
    };
  } catch (e: any) {
    return {
      shape: null,
      sketch: null,
      params: getCollectedParams(),
      error: e.message || String(e),
      timeMs: performance.now() - t0,
    };
  }
}

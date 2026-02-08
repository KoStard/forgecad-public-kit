/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 *
 * Supports cross-file imports via importSketch() and importPart().
 */

import { Shape, box, cylinder, sphere, union, difference, intersection } from './kernel';
import { Sketch, rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, union2d, difference2d, intersection2d, hull2d, path, stroke } from './sketch';
import { param, resetParams, getCollectedParams, setParamOverrides, type ParamDef } from './params';
import { partLibrary } from './library';

export interface RunResult {
  shape: Shape | null;
  sketch: Sketch | null;
  params: ParamDef[];
  error: string | null;
  timeMs: number;
}

/**
 * Execute a single file's code with the forge sandbox.
 * `allFiles` enables cross-file imports.
 * `visited` prevents circular imports.
 */
function executeFile(
  code: string,
  fileName: string,
  allFiles: Record<string, string>,
  visited: Set<string>,
): Shape | Sketch | null {
  if (visited.has(fileName)) {
    throw new Error(`Circular import detected: ${fileName}`);
  }
  visited.add(fileName);

  // importSketch("name") — executes another file, expects a Sketch result
  const importSketch = (name: string): Sketch => {
    const src = allFiles[name];
    if (!src) throw new Error(`File not found: "${name}"`);
    const result = executeFile(src, name, allFiles, visited);
    if (result instanceof Sketch) return result;
    throw new Error(`"${name}" did not return a Sketch`);
  };

  // importPart("name") — executes another file, expects a Shape result
  const importPart = (name: string): Shape => {
    const src = allFiles[name];
    if (!src) throw new Error(`File not found: "${name}"`);
    const result = executeFile(src, name, allFiles, visited);
    if (result instanceof Shape) return result;
    throw new Error(`"${name}" did not return a Shape`);
  };

  const wrapped = `"use strict";\n${code}`;

  const fn = new Function(
    // 3D
    'box', 'cylinder', 'sphere',
    'union', 'difference', 'intersection',
    // 2D
    'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star', 'path', 'stroke',
    'union2d', 'difference2d', 'intersection2d', 'hull2d',
    // Params & classes
    'param', 'Shape', 'Sketch', 'lib',
    // Cross-file imports
    'importSketch', 'importPart',
    wrapped,
  );

  return fn(
    box, cylinder, sphere,
    union, difference, intersection,
    rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, path, stroke,
    union2d, difference2d, intersection2d, hull2d,
    param, Shape, Sketch, partLibrary,
    importSketch, importPart,
  );
}

export function runScript(
  code: string,
  fileName = 'main.forge.js',
  allFiles: Record<string, string> = {},
): RunResult {
  resetParams();
  const t0 = performance.now();

  try {
    const result = executeFile(code, fileName, allFiles, new Set());

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

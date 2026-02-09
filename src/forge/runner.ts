/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 *
 * Supports cross-file imports via importSketch() and importPart().
 */

import { Shape, box, cylinder, sphere, union, difference, intersection } from './kernel';
import { intersectWithPlane, projectToPlane } from './section';
import {
  Sketch,
  rect,
  circle2d,
  roundedRect,
  polygon,
  ngon,
  ellipse,
  slot,
  star,
  union2d,
  difference2d,
  intersection2d,
  hull2d,
  path,
  stroke,
  constrainedSketch,
  ConstraintSketch,
  type SketchConstraintMeta,
  Point2D,
  Line2D,
  Circle2D,
  Rectangle2D,
  TrackedShape,
  point,
  line,
  circle,
  rectangle,
  Constraint,
  degrees,
  radians,
} from './sketch';
import { param, resetParams, getCollectedParams, setParamOverrides, type ParamDef } from './params';
import { partLibrary } from './library';

export interface SceneObject {
  id: string;
  name: string;
  shape: Shape | null;
  sketch: Sketch | null;
  color?: string;
  sketchMeta?: SketchConstraintMeta;
}

export interface RunResult {
  shape: Shape | null;
  sketch: Sketch | null;
  objects: SceneObject[];
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
): Shape | Sketch | TrackedShape | null {
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

  // Wrappers that auto-unwrap TrackedShape for boolean ops
  const unwrap = (s: Shape | TrackedShape): Shape =>
    s instanceof TrackedShape ? s.toShape() : s;
  const wrappedUnion = (...shapes: (Shape | TrackedShape)[]) => union(...shapes.map(unwrap));
  const wrappedDifference = (...shapes: (Shape | TrackedShape)[]) => difference(...shapes.map(unwrap));
  const wrappedIntersection = (...shapes: (Shape | TrackedShape)[]) => intersection(...shapes.map(unwrap));

  const fn = new Function(
    // 3D
    'box', 'cylinder', 'sphere',
    'union', 'difference', 'intersection',
    // 2D
    'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star', 'path', 'stroke', 'constrainedSketch',
    'union2d', 'difference2d', 'intersection2d', 'hull2d',
    // Entities
    'Point2D', 'Line2D', 'Circle2D', 'Rectangle2D', 'TrackedShape', 'point', 'line', 'circle', 'rectangle', 'Constraint', 'degrees', 'radians',
    // Params & classes
    'param', 'Shape', 'Sketch', 'lib',
    // Plane ops
    'intersectWithPlane', 'projectToPlane',
    // Cross-file imports
    'importSketch', 'importPart',
    wrapped,
  );

  return fn(
    box, cylinder, sphere,
    wrappedUnion, wrappedDifference, wrappedIntersection,
    rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, path, stroke, constrainedSketch,
    union2d, difference2d, intersection2d, hull2d,
    Point2D, Line2D, Circle2D, Rectangle2D, TrackedShape, point, line, circle, rectangle, Constraint, degrees, radians,
    param, Shape, Sketch, partLibrary,
    intersectWithPlane, projectToPlane,
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

    const objects: SceneObject[] = [];
    const pushShape = (shape: Shape, name: string) => {
      objects.push({ id: `obj-${objects.length + 1}`, name, shape, sketch: null, color: shape.colorHex });
    };
    const pushSketch = (sketch: Sketch, name: string) => {
      const meta = sketch instanceof ConstraintSketch ? sketch.constraintMeta : undefined;
      objects.push({
        id: `obj-${objects.length + 1}`,
        name,
        shape: null,
        sketch,
        sketchMeta: meta,
        color: sketch.colorHex,
      });
    };

    const isNamedObject = (item: unknown): item is { name: string; shape?: Shape; sketch?: Sketch; color?: string } => {
      return !!item && typeof item === 'object' && 'name' in item;
    };

    if (Array.isArray(result)) {
      result.forEach((item, index) => {
        const label = `Object ${index + 1}`;
        if (item instanceof TrackedShape) {
          pushShape(item.toShape(), label);
          return;
        }
        if (item instanceof Shape) {
          pushShape(item, label);
          return;
        }
        if (item instanceof Sketch) {
          pushSketch(item, label);
          return;
        }
        if (isNamedObject(item)) {
          const name = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : label;
          if (item.shape instanceof TrackedShape) {
            objects.push({ id: `obj-${objects.length + 1}`, name, shape: item.shape.toShape(), sketch: null, color: item.color || item.shape.toShape().colorHex });
            return;
          }
          if (item.shape instanceof Shape) {
            objects.push({ id: `obj-${objects.length + 1}`, name, shape: item.shape, sketch: null, color: item.color || item.shape.colorHex });
            return;
          }
          if (item.sketch instanceof Sketch) {
            const meta = item.sketch instanceof ConstraintSketch ? item.sketch.constraintMeta : undefined;
            objects.push({
              id: `obj-${objects.length + 1}`,
              name,
              shape: null,
              sketch: item.sketch,
              sketchMeta: meta,
              color: item.color || item.sketch.colorHex,
            });
            return;
          }
        }
        throw new Error('Array results must contain Shape/Sketch items');
      });
    } else if (result instanceof TrackedShape) {
      pushShape(result.toShape(), fileName);
    } else if (result instanceof Shape) {
      pushShape(result, fileName);
    } else if (result instanceof Sketch) {
      pushSketch(result, fileName);
    }

    const shape = objects.length === 1 ? objects[0].shape : null;
    const sketch = objects.length === 1 ? objects[0].sketch : null;

    return {
      shape,
      sketch,
      objects,
      params: getCollectedParams(),
      error: objects.length > 0 ? null : 'Script must return a Shape or Sketch',
      timeMs: performance.now() - t0,
    };
  } catch (e: any) {
    return {
      shape: null,
      sketch: null,
      objects: [],
      params: getCollectedParams(),
      error: e.message || String(e),
      timeMs: performance.now() - t0,
    };
  }
}

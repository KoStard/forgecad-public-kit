/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 *
 * Supports cross-file imports via importSketch() and importPart().
 */

import { Shape, box, cylinder, sphere, union, difference, intersection, hull3d, levelSet } from './kernel';
import type { Anchor3D } from './kernel';
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
  buildRectExtrusionTopology,
  buildCircleExtrusionTopology,
  point,
  line,
  circle,
  rectangle,
  Constraint,
  degrees,
  radians,
  linearPattern,
  circularPattern,
  mirrorCopy,
  filletEdge,
  chamferEdge,
  arcBridgeBetweenRects,
  dim,
  dimLine,
  resetDimensions,
  getCollectedDimensions,
  type DimensionDef,
} from './sketch';
import { param, resetParams, getCollectedParams, setParamOverrides, type ParamDef } from './params';
import { joint } from './joint';
import { Assembly, SolvedAssembly, assembly, bomToCsv } from './assembly';
import { Transform, composeChain } from './transform';
import { partLibrary } from './library';
import { ShapeGroup, group } from './group';
import { cutPlane, resetCutPlanes, getCollectedCutPlanes, type CutPlaneDef } from './cutPlane';

export interface SceneObject {
  id: string;
  name: string;
  shape: Shape | null;
  sketch: Sketch | null;
  color?: string;
  sketchMeta?: SketchConstraintMeta;
  /** If this object belongs to a named group (assembly), the group name */
  groupName?: string;
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  args: string[];
  timestamp: number;
}

export interface RunResult {
  shape: Shape | null;
  sketch: Sketch | null;
  objects: SceneObject[];
  params: ParamDef[];
  dimensions: DimensionDef[];
  cutPlanes: CutPlaneDef[];
  error: string | null;
  timeMs: number;
  logs: LogEntry[];
}

// Collected logs from the current script execution
let _collectedLogs: LogEntry[] = [];

function makeSandboxConsole(): Record<string, (...args: unknown[]) => void> {
  const capture = (level: LogEntry['level']) => (...args: unknown[]) => {
    _collectedLogs.push({
      level,
      args: args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); }
        catch { return String(a); }
      }),
      timestamp: Date.now(),
    });
  };
  return { log: capture('log'), warn: capture('warn'), error: capture('error'), info: capture('info') };
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
): Shape | Sketch | TrackedShape | ShapeGroup | null {
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

  const wrappedHull3d = (...args: (Shape | TrackedShape | [number, number, number])[]) =>
    hull3d(...args.map(a => a instanceof TrackedShape ? a.toShape() : a));

  // Tracked wrappers for primitives — user scripts get TrackedShape with named faces/edges
  const trackedBox = (x: number, y: number, z: number, center = false): TrackedShape => {
    const shape = box(x, y, z, center);
    const ox = center ? -x / 2 : 0;
    const oy = center ? -y / 2 : 0;
    const r = Rectangle2D.fromDimensions(ox, oy, x, y);
    const topo = buildRectExtrusionTopology(r, z);
    return new TrackedShape(shape, topo, 0, true);
  };

  const trackedCylinder = (
    height: number, radius: number, radiusTop?: number, segments?: number, center = false,
  ): TrackedShape => {
    const shape = cylinder(height, radius, radiusTop, segments, center);
    const cz = center ? -height / 2 : 0;
    const c = { center: new Point2D(0, 0), radius };
    const topo = buildCircleExtrusionTopology(c, height);
    if (center) {
      // offset topology down by half height
      for (const f of topo.faces.values()) {
        f.center = [f.center[0], f.center[1], f.center[2] - height / 2];
      }
      for (const e of topo.edges.values()) {
        e.start = [e.start[0], e.start[1], e.start[2] - height / 2];
        e.end = [e.end[0], e.end[1], e.end[2] - height / 2];
      }
    }
    return new TrackedShape(shape, topo, 0, true);
  };

  const fn = new Function(
    // 3D
    'box', 'cylinder', 'sphere',
    'union', 'difference', 'intersection',
    'hull3d', 'levelSet',
    // 2D
    'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star', 'path', 'stroke', 'constrainedSketch',
    'union2d', 'difference2d', 'intersection2d', 'hull2d',
    // Entities
    'Point2D', 'Line2D', 'Circle2D', 'Rectangle2D', 'TrackedShape', 'point', 'line', 'circle', 'rectangle', 'Constraint', 'degrees', 'radians',
    // Patterns
    'linearPattern', 'circularPattern', 'mirrorCopy',
    // Fillets
    'filletEdge', 'chamferEdge',
    // Arc bridge
    'arcBridgeBetweenRects',
    // Params & classes
    'param', 'Shape', 'Sketch', 'lib',
    // Joints
    'joint',
    // Transform + Assembly
    'Transform', 'composeChain', 'assembly', 'Assembly', 'SolvedAssembly', 'bomToCsv',
    // Plane ops
    'intersectWithPlane', 'projectToPlane',
    // Cross-file imports
    'importSketch', 'importPart',
    // Dimensions
    'dim', 'dimLine',
    // Group
    'group', 'ShapeGroup',
    // Console
    'console',
    // Cut planes
    'cutPlane',
    wrapped,
  );

  return fn(
    trackedBox, trackedCylinder, sphere,
    wrappedUnion, wrappedDifference, wrappedIntersection,
    wrappedHull3d, levelSet,
    rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, path, stroke, constrainedSketch,
    union2d, difference2d, intersection2d, hull2d,
    Point2D, Line2D, Circle2D, Rectangle2D, TrackedShape, point, line, circle, rectangle, Constraint, degrees, radians,
    linearPattern, circularPattern, mirrorCopy,
    filletEdge, chamferEdge,
    arcBridgeBetweenRects,
    param, Shape, Sketch, partLibrary,
    joint,
    Transform, composeChain, assembly, Assembly, SolvedAssembly, bomToCsv,
    intersectWithPlane, projectToPlane,
    importSketch, importPart,
    dim, dimLine,
    group, ShapeGroup,
    makeSandboxConsole(),
    cutPlane,
  );
}

export function runScript(
  code: string,
  fileName = 'main.forge.js',
  allFiles: Record<string, string> = {},
): RunResult {
  resetParams();
  resetDimensions();
  resetCutPlanes();
  _collectedLogs = [];
  const t0 = performance.now();

  try {
    const result = executeFile(code, fileName, allFiles, new Set());

    const objects: SceneObject[] = [];
    const pushShape = (shape: Shape, name: string, groupName?: string) => {
      objects.push({ id: `obj-${objects.length + 1}`, name, shape, sketch: null, color: shape.colorHex, groupName });
      if (shape.isEmpty()) {
        _collectedLogs.push({
          level: 'warn',
          args: [`Object "${name}" is empty. This usually means full clipping, full subtraction, or invalid geometry.`],
          timestamp: Date.now(),
        });
      }
    };
    const pushSketch = (sketch: Sketch, name: string, groupName?: string) => {
      const meta = sketch instanceof ConstraintSketch ? sketch.constraintMeta : undefined;
      objects.push({
        id: `obj-${objects.length + 1}`,
        name,
        shape: null,
        sketch,
        sketchMeta: meta,
        color: sketch.colorHex,
        groupName,
      });
    };

    const isNamedObject = (item: unknown): item is { name: string; shape?: Shape; sketch?: Sketch; color?: string; group?: unknown[] } => {
      return !!item && typeof item === 'object' && 'name' in item;
    };

    const flattenGroupChild = (child: Shape | Sketch | TrackedShape | ShapeGroup, label: string, groupName?: string) => {
      if (child instanceof ShapeGroup) {
        child.children.forEach((nested, i) => {
          flattenGroupChild(nested, `${label}.${i + 1}`, groupName);
        });
        return;
      }
      if (child instanceof TrackedShape) {
        pushShape(child.toShape(), label, groupName);
      } else if (child instanceof Shape) {
        pushShape(child, label, groupName);
      } else if (child instanceof Sketch) {
        pushSketch(child, label, groupName);
      }
    };

    /** Process a named object item (from array return format), optionally within a parent group */
    const processNamedItem = (item: any, fallbackLabel: string, parentGroup?: string) => {
      const name = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : fallbackLabel;
      const grp = parentGroup;

      // Handle { name, group: [...] } — nested assembly group
      if (Array.isArray(item.group)) {
        item.group.forEach((child: any, i: number) => {
          const childLabel = `${name}.${i + 1}`;
          if (child instanceof ShapeGroup) {
            flattenGroupChild(child, childLabel, name);
          } else if (child instanceof TrackedShape) {
            pushShape(child.toShape(), childLabel, name);
          } else if (child instanceof Shape) {
            pushShape(child, childLabel, name);
          } else if (child instanceof Sketch) {
            pushSketch(child, childLabel, name);
          } else if (isNamedObject(child)) {
            processNamedItem(child, childLabel, name);
          }
        });
        return;
      }

      if (item.shape instanceof ShapeGroup) {
        item.shape.children.forEach((child: any, i: number) => flattenGroupChild(child, `${name}.${i + 1}`, name));
        return;
      }
      if (item.shape instanceof TrackedShape) {
        objects.push({ id: `obj-${objects.length + 1}`, name, shape: item.shape.toShape(), sketch: null, color: item.color || item.shape.toShape().colorHex, groupName: grp });
        return;
      }
      if (item.shape instanceof Shape) {
        objects.push({ id: `obj-${objects.length + 1}`, name, shape: item.shape, sketch: null, color: item.color || item.shape.colorHex, groupName: grp });
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
          groupName: grp,
        });
        return;
      }
    };

    if (result instanceof ShapeGroup) {
      result.children.forEach((child, i) => flattenGroupChild(child, `Object ${i + 1}`));
    } else if (Array.isArray(result)) {
      result.forEach((item, index) => {
        const label = `Object ${index + 1}`;
        if (item instanceof ShapeGroup) {
          item.children.forEach((child, i) => flattenGroupChild(child, `${label}.${i + 1}`));
          return;
        }
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
          processNamedItem(item, label);
          return;
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
      dimensions: getCollectedDimensions(),
      cutPlanes: getCollectedCutPlanes(),
      error: objects.length > 0 ? null : 'Script must return a Shape or Sketch',
      timeMs: performance.now() - t0,
      logs: _collectedLogs.slice(),
    };
  } catch (e: any) {
    const msg = e.message || String(e);
    const stack = e.stack || '';
    // Extract script line number from stack: "<anonymous>:LINE:COL" — offset by 2 (Function wrapper + "use strict")
    let lineInfo = '';
    const m = stack.match(/<anonymous>:(\d+):(\d+)/);
    if (m) {
      const scriptLine = Math.max(1, parseInt(m[1], 10) - 2);
      lineInfo = ` (line ${scriptLine})`;
    }
    _collectedLogs.push({ level: 'error', args: [`${msg}${lineInfo}`, ...(stack ? [stack] : [])], timestamp: Date.now() });
    return {
      shape: null,
      sketch: null,
      objects: [],
      params: getCollectedParams(),
      dimensions: getCollectedDimensions(),
      cutPlanes: getCollectedCutPlanes(),
      error: `${msg}${lineInfo}`,
      timeMs: performance.now() - t0,
      logs: _collectedLogs.slice(),
    };
  }
}

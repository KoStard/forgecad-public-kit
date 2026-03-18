/**
 * High-Level Constraint Concepts
 *
 * Factory functions that add structurally-constrained shapes to a
 * `ConstrainedSketchBuilder` and return typed handles with canonical named
 * access to vertices, sides, and center points.
 *
 * Canonical conventions (non-negotiable):
 *
 * - Winding: **CCW** (counter-clockwise, standard mathematical orientation)
 * - Rectangle vertex order: bottomLeft → bottomRight → topRight → topLeft
 * - `sides[i]` runs from `vertices[i]` → `vertices[(i+1) % n]`
 * - RegularPolygon `vertices[0]` is at `startAngle` (default 0 = +X axis)
 */

import type { LineId, PointId, ShapeId } from './constraints/types';
import { ConstrainedSketchBuilder } from './constraints/builder';

// ─── Rectangle ──────────────────────────────────────────────────────────────

export type RectVertexName = 'bottomLeft' | 'bottomRight' | 'topRight' | 'topLeft';
export type RectSideName = 'bottom' | 'right' | 'top' | 'left';

export interface RectOptions {
  /** Bottom-left x coordinate. Default: 0. */
  x?: number;
  /** Bottom-left y coordinate. Default: 0. */
  y?: number;
  /** Width (along x). Default: 10. */
  width?: number;
  /** Height (along y). Default: 10. */
  height?: number;
}

/**
 * Typed handle for a constrained axis-aligned rectangle in the solver.
 *
 * Structural constraints pre-applied:
 *   `horizontal(bottom)`, `horizontal(top)`, `vertical(left)`, `vertical(right)`.
 *
 * This leaves **4 DOF** (position x/y, width, height). Use `sk.fix()`,
 * `sk.length()`, `sk.shapeWidth()`, etc. to pin them.
 */
export interface ConstrainedRect {
  // Named vertices (PointId) — CCW order: bl → br → tr → tl
  readonly bottomLeft: PointId;
  readonly bottomRight: PointId;
  readonly topRight: PointId;
  readonly topLeft: PointId;

  // Named sides (LineId) — direction follows CCW traversal
  /** bottom-left → bottom-right */
  readonly bottom: LineId;
  /** bottom-right → top-right */
  readonly right: LineId;
  /** top-right → top-left */
  readonly top: LineId;
  /** top-left → bottom-left */
  readonly left: LineId;

  /**
   * Center point constrained to the geometric center via `midpoint` on the diagonal.
   * Can be used in further constraints: `sk.fix(rect.center, 0, 0)`,
   * `sk.coincident(rect.center, other)`.
   */
  readonly center: PointId;

  /** ShapeId for `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y`. */
  readonly shape: ShapeId;

  /** CCW-ordered vertex array: [bottomLeft, bottomRight, topRight, topLeft]. */
  readonly vertices: [PointId, PointId, PointId, PointId];
  /** CCW-ordered side array: [bottom, right, top, left]. */
  readonly sides: [LineId, LineId, LineId, LineId];

  /** Named vertex lookup. */
  vertex(name: RectVertexName): PointId;
  /** Named side lookup. */
  side(name: RectSideName): LineId;
}

/**
 * Add an axis-aligned rectangle concept to the builder.
 *
 * Creates 4 vertices (CCW: bl→br→tr→tl), 4 sides, applies 4 structural
 * constraints (`horizontal`/`vertical` on each side), registers a loop and
 * a shape, and returns a `ConstrainedRect` handle.
 *
 * @example
 * ```ts
 * const sk = constrainedSketch();
 * const rect = addRect(sk, { x: 0, y: 0, width: 100, height: 50 });
 * sk.fix(rect.bottomLeft, 0, 0);
 * sk.length(rect.bottom, 120);
 * ```
 */
export function addRect(
  sk: ConstrainedSketchBuilder,
  options: RectOptions = {},
): ConstrainedRect {
  const { x = 0, y = 0, width = 10, height = 10 } = options;

  // Vertices in CCW order: bl → br → tr → tl
  const bl = sk.point(x,         y);
  const br = sk.point(x + width, y);
  const tr = sk.point(x + width, y + height);
  const tl = sk.point(x,         y + height);

  // Sides in CCW traversal direction
  const bottom = sk.line(bl, br);
  const right  = sk.line(br, tr);
  const top    = sk.line(tr, tl);
  const left   = sk.line(tl, bl);

  // Structural constraints: axis-aligned rectangle
  // 4 independent equations → 4 DOF left (x, y, width, height)
  sk.horizontal(bottom);
  sk.horizontal(top);
  sk.vertical(right);
  sk.vertical(left);

  // Center point: midpoint of the bl→tr diagonal (construction line)
  const diag = sk.line(bl, tr, /* construction */ true);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const center = sk.point(cx, cy);
  sk.midpoint(center, diag);

  // Shape for dimensional shape constraints
  const shapeId = sk.shape([bottom, right, top, left]);

  // Register closed loop for sketch generation
  sk.addLoop([bl, br, tr, tl]);

  return {
    bottomLeft: bl,
    bottomRight: br,
    topRight: tr,
    topLeft: tl,
    bottom,
    right,
    top,
    left,
    center,
    shape: shapeId,
    vertices: [bl, br, tr, tl],
    sides: [bottom, right, top, left],
    vertex(name: RectVertexName): PointId {
      switch (name) {
        case 'bottomLeft':  return bl;
        case 'bottomRight': return br;
        case 'topRight':    return tr;
        case 'topLeft':     return tl;
      }
    },
    side(name: RectSideName): LineId {
      switch (name) {
        case 'bottom': return bottom;
        case 'right':  return right;
        case 'top':    return top;
        case 'left':   return left;
      }
    },
  };
}

// ─── Polygon ─────────────────────────────────────────────────────────────────

export interface PolygonOptions {
  /** Initial vertex coordinates. Minimum 3 points. */
  points: ReadonlyArray<readonly [number, number]>;
  /**
   * Whether to register a closed loop for sketch generation.
   * Default: true.
   */
  addLoop?: boolean;
}

/**
 * Typed handle for a general constrained polygon in the solver.
 *
 * Structural constraints pre-applied: `ccw(vertices)` for winding enforcement.
 *
 * `sides[i]` goes from `vertices[i]` → `vertices[(i+1) % n]`.
 */
export interface ConstrainedPolygon {
  /** CCW-ordered PointIds. */
  readonly vertices: PointId[];
  /**
   * CCW-ordered LineIds.
   * `sides[i]` runs from `vertices[i]` → `vertices[(i+1) % n]`.
   */
  readonly sides: LineId[];
  /** ShapeId for `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y`. */
  readonly shape: ShapeId;

  /** Get vertex by index. */
  vertex(index: number): PointId;
  /** Get side by index (side `i` goes vertex `i` → vertex `(i+1) % n`). */
  side(index: number): LineId;
}

/**
 * Add a general polygon concept to the builder.
 *
 * Creates n vertices and n sides (CCW: `sides[i]` from `vertices[i]` →
 * `vertices[(i+1) % n]`). Applies a `ccw` constraint to enforce winding.
 * The user is responsible for all dimensional constraints.
 *
 * @example
 * ```ts
 * const sk = constrainedSketch();
 * const tri = addPolygon(sk, { points: [[0,0],[100,0],[50,80]] });
 * sk.fix(tri.vertex(0), 0, 0);
 * sk.length(tri.side(0), 100);
 * ```
 */
export function addPolygon(
  sk: ConstrainedSketchBuilder,
  options: PolygonOptions,
): ConstrainedPolygon {
  const { points, addLoop: registerLoop = true } = options;
  if (points.length < 3) throw new Error('addPolygon: requires at least 3 points');

  // Create all vertex points
  const vertices: PointId[] = points.map(([px, py]) => sk.point(px, py));

  // Create sides: side[i] goes vertices[i] → vertices[(i+1) % n]
  const n = vertices.length;
  const sides: LineId[] = vertices.map((v, i) => sk.line(v, vertices[(i + 1) % n]));

  // Enforce CCW winding
  sk.ccw(...vertices);

  // Shape for dimensional constraints
  const shapeId = sk.shape(sides);

  if (registerLoop) {
    sk.addLoop(vertices);
  }

  return {
    vertices,
    sides,
    shape: shapeId,
    vertex(index: number): PointId {
      return vertices[((index % n) + n) % n];
    },
    side(index: number): LineId {
      return sides[((index % n) + n) % n];
    },
  };
}

// ─── Regular Polygon ─────────────────────────────────────────────────────────

export interface RegularPolygonOptions {
  /** Number of sides (minimum 3). */
  sides: number;
  /** Circumradius — distance from center to vertex. Default: 10. */
  radius?: number;
  /** Center x coordinate. Default: 0. */
  cx?: number;
  /** Center y coordinate. Default: 0. */
  cy?: number;
  /**
   * Angle (in degrees) of vertex[0] measured from the +X axis (CCW positive).
   * Default: 0 (rightmost vertex).
   */
  startAngle?: number;
}

/**
 * Typed handle for a constrained regular polygon in the solver.
 *
 * Structural constraints pre-applied:
 * - `equal(sides[0], sides[1])`, ..., `equal(sides[n-2], sides[n-1])` — equal sides
 * - `ccw(vertices)` — CCW winding
 *
 * Leaves **4 DOF** (center x/y, radius/scale, rotation). The center point is
 * tracked by the solver and exposed for further constraints.
 *
 * Note: Equal sides + CCW + regular initial placement makes this
 * "practically regular" for the solver. If you need geometrically exact
 * regularity (equal angles too), add `angleBetween` constraints on each pair
 * of adjacent sides.
 */
export interface ConstrainedRegularPolygon extends ConstrainedPolygon {
  /**
   * Center point. Use `sk.fix(poly.center, x, y)` to pin location,
   * or `sk.coincident(poly.center, other)` to align with other geometry.
   */
  readonly center: PointId;
}

/**
 * Add a regular n-gon concept to the builder.
 *
 * Vertices are placed at `(cx + r·cos(startAngle + i·2π/n), cy + r·sin(...))`.
 * Equal-side constraints enforce regularity. The center point is constrained
 * to the centroid via midpoint constraints on the first diagonal.
 *
 * @example
 * ```ts
 * const sk = constrainedSketch();
 * const hex = addRegularPolygon(sk, { sides: 6, radius: 25, cx: 0, cy: 0 });
 * sk.fix(hex.center, 0, 0);
 * sk.length(hex.side(0), 30);  // changes all sides (equal constraint)
 * ```
 */
export function addRegularPolygon(
  sk: ConstrainedSketchBuilder,
  options: RegularPolygonOptions,
): ConstrainedRegularPolygon {
  const { sides: n, radius = 10, cx = 0, cy = 0, startAngle = 0 } = options;
  if (n < 3) throw new Error('addRegularPolygon: minimum 3 sides');

  const startRad = (startAngle * Math.PI) / 180;
  const step = (2 * Math.PI) / n;

  // Place vertices at regular positions
  const coords: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const angle = startRad + i * step;
    coords.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }

  // Create center point before building polygon so it's available for constraints
  const center = sk.point(cx, cy);

  // Use addPolygon for the base structure (vertices, sides, ccw, shape, loop)
  const poly = addPolygon(sk, { points: coords });

  // Construction lines from center to each vertex — used for equal-radius constraints
  const radialLines: LineId[] = poly.vertices.map((v) =>
    sk.line(center, v, /* construction */ true),
  );

  // Equal-radius constraints: all vertices equidistant from center (n-1 equations)
  for (let i = 0; i < n - 1; i++) {
    sk.equal(radialLines[i], radialLines[i + 1]);
  }

  // Equal-side constraints: all sides equal length (n-1 equations)
  // Combined with equal-radius: uniquely defines a regular n-gon (4 DOF: x, y, r, rotation)
  for (let i = 0; i < n - 1; i++) {
    sk.equal(poly.sides[i], poly.sides[i + 1]);
  }

  return {
    ...poly,
    center,
  };
}

// ─── Builder convenience methods ─────────────────────────────────────────────
// These are added to ConstrainedSketchBuilder's prototype at module load time
// so users can call sk.rect(...), sk.addPolygon(...), sk.regularPolygon(...).

declare module './constraints/builder' {
  interface ConstrainedSketchBuilder {
    /**
     * Add an axis-aligned rectangle concept.
     * Returns a `ConstrainedRect` handle with named vertices, sides, and center.
     */
    rect(options?: RectOptions): ConstrainedRect;

    /**
     * Add a general polygon concept (CCW winding enforced).
     * Returns a `ConstrainedPolygon` handle.
     */
    addPolygon(options: PolygonOptions): ConstrainedPolygon;

    /**
     * Add a regular n-gon concept (equal sides, CCW winding).
     * Returns a `ConstrainedRegularPolygon` handle with a center point.
     */
    regularPolygon(options: RegularPolygonOptions): ConstrainedRegularPolygon;
  }
}

(ConstrainedSketchBuilder.prototype as any).rect = function (
  this: ConstrainedSketchBuilder,
  options?: RectOptions,
): ConstrainedRect {
  return addRect(this, options);
};

(ConstrainedSketchBuilder.prototype as any).addPolygon = function (
  this: ConstrainedSketchBuilder,
  options: PolygonOptions,
): ConstrainedPolygon {
  return addPolygon(this, options);
};

(ConstrainedSketchBuilder.prototype as any).regularPolygon = function (
  this: ConstrainedSketchBuilder,
  options: RegularPolygonOptions,
): ConstrainedRegularPolygon {
  return addRegularPolygon(this, options);
};

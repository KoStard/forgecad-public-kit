/**
 * Builder convenience concept for regular polygons.
 *
 * This file does not solve constraints; it emits regular-polygon geometry and constraints into the builder.
 */
import type { LineId, PointId } from '../types';
import { ConstrainedSketchBuilder } from '../builder';
import { addPolygon, type ConstrainedPolygon } from './polygon';

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
  /** Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false. */
  blockRotation?: boolean;
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
  const { sides: n, radius = 10, cx = 0, cy = 0, startAngle = 0, blockRotation = false } = options;
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
  const poly = addPolygon(sk, { points: coords, blockRotation });

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

// ─── Builder convenience method ───────────────────────────────────────────────

declare module '../builder' {
  interface ConstrainedSketchBuilder {
    /**
     * Add a regular n-gon concept (equal sides, CCW winding).
     * Returns a `ConstrainedRegularPolygon` handle with a center point.
     */
    regularPolygon(options: RegularPolygonOptions): ConstrainedRegularPolygon;
  }
}

(ConstrainedSketchBuilder.prototype as any).regularPolygon = function (
  this: ConstrainedSketchBuilder,
  options: RegularPolygonOptions,
): ConstrainedRegularPolygon {
  return addRegularPolygon(this, options);
};

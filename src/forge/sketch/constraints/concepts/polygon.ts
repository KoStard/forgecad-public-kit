/**
 * Builder convenience concept for general polygons.
 *
 * This file does not solve constraints; it emits polygon geometry and constraints into the builder.
 */
import type { LineId, PointId, ShapeId } from '../types';
import { ConstrainedSketchBuilder } from '../builder';

export interface PolygonOptions {
  /** Initial vertex coordinates. Minimum 3 points. */
  points: ReadonlyArray<readonly [number, number]>;
  /**
   * Whether to register a closed loop for sketch generation.
   * Default: true.
   */
  addLoop?: boolean;
  /** Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false. */
  blockRotation?: boolean;
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
  const { points, addLoop: registerLoop = true, blockRotation = false } = options;
  if (points.length < 3) throw new Error('addPolygon: requires at least 3 points');

  // Create all vertex points
  const vertices: PointId[] = points.map(([px, py]) => sk.point(px, py));

  // Create sides: side[i] goes vertices[i] → vertices[(i+1) % n]
  const n = vertices.length;
  const sides: LineId[] = vertices.map((v, i) => sk.line(v, vertices[(i + 1) % n]));

  // Enforce CCW winding
  sk.ccw(...vertices);
  if (blockRotation) {
    sk.blockRotation(vertices);
  }

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

// ─── Builder convenience method ───────────────────────────────────────────────

declare module '../builder' {
  interface ConstrainedSketchBuilder {
    /**
     * Add a general polygon concept (CCW winding enforced).
     * Returns a `ConstrainedPolygon` handle.
     */
    addPolygon(options: PolygonOptions): ConstrainedPolygon;
  }
}

(ConstrainedSketchBuilder.prototype as any).addPolygon = function (
  this: ConstrainedSketchBuilder,
  options: PolygonOptions,
): ConstrainedPolygon {
  return addPolygon(this, options);
};

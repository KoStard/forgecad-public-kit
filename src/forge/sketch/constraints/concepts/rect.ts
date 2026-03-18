/**
 * Rectangle Concept
 *
 * Factory that adds a structurally-constrained axis-aligned rectangle to a
 * `ConstrainedSketchBuilder` and returns a typed handle with named vertices,
 * sides, and center point.
 *
 * Winding: CCW (bottomLeft → bottomRight → topRight → topLeft)
 */

import type { LineId, PointId, ShapeId } from '../types';
import { ConstrainedSketchBuilder } from '../builder';

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
 *   `horizontal(bottom)`, `horizontal(top)`, `vertical(left)`, `vertical(right)`,
 *   `ccw(bl, br, tr, tl)`.
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
 * constraints (`horizontal`/`vertical` on each side), enforces CCW winding,
 * registers a loop and a shape, and returns a `ConstrainedRect` handle.
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

  // Enforce CCW winding
  sk.ccw(bl, br, tr, tl);

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

// ─── Builder convenience method ───────────────────────────────────────────────

declare module '../builder' {
  interface ConstrainedSketchBuilder {
    /**
     * Add an axis-aligned rectangle concept.
     * Returns a `ConstrainedRect` handle with named vertices, sides, and center.
     */
    rect(options?: RectOptions): ConstrainedRect;
  }
}

(ConstrainedSketchBuilder.prototype as any).rect = function (
  this: ConstrainedSketchBuilder,
  options?: RectOptions,
): ConstrainedRect {
  return addRect(this, options);
};

/**
 * Builder convenience concept for a rectangle as a rigid-body group.
 *
 * Unlike `addRect` (which creates 4 free points and 4 structural constraints),
 * `addGroupRect` creates a group with fixed local geometry — the shape is rigid
 * by construction. The solver sees only 2 DOF (x, y) since rotation is fixed.
 *
 * Use this when you want a rectangle that moves as a rigid unit and never changes
 * shape — e.g., a board layout, a component footprint, or a fixed-size panel.
 */
import type { LineId, PointId, ShapeId } from '../types';
import { ConstrainedSketchBuilder, SketchGroupHandle } from '../builder';

export interface GroupRectOptions {
  /** Bottom-left x coordinate (world). Default: 0. */
  x?: number;
  /** Bottom-left y coordinate (world). Default: 0. */
  y?: number;
  /** Width (along x in local coords). Required. */
  width: number;
  /** Height (along y in local coords). Required. */
  height: number;
  /** Allow the solver to rotate this rectangle. Default: false. */
  allowRotation?: boolean;
}

/**
 * Typed handle for a group rectangle.
 * Extends SketchGroupHandle with named vertex/side accessors.
 */
export interface ConstrainedGroupRect extends SketchGroupHandle {
  readonly bottomLeft: PointId;
  readonly bottomRight: PointId;
  readonly topRight: PointId;
  readonly topLeft: PointId;
  readonly bottom: LineId;
  readonly right: LineId;
  readonly top: LineId;
  readonly left: LineId;
  readonly shape: ShapeId;
}

/**
 * Add a rigid rectangle as a group to the builder.
 *
 * The rectangle's shape is fixed by local coordinates — no structural
 * constraints needed (no horizontal/vertical/ccw). The solver sees only
 * 2 DOF (translation) or 3 DOF (translation + rotation).
 *
 * @example
 * ```ts
 * const sk = constrainedSketch();
 * const panel = addGroupRect(sk, { x: 0, y: 0, width: 100, height: 50 });
 * sk.fix(panel.bottomLeft, 0, 0);   // pins the rectangle in place
 * sk.distance(panel.bottomLeft, otherPoint, 30);
 * ```
 */
export function addGroupRect(sk: ConstrainedSketchBuilder, options: GroupRectOptions): ConstrainedGroupRect {
  const { x = 0, y = 0, width, height, allowRotation = false } = options;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`addGroupRect(): width and height must be finite, got (${width}, ${height})`);
  }

  const g = sk.group({ x, y });

  // Vertices in local coords (CCW: bl → br → tr → tl)
  const bl = g.point(0, 0);
  const br = g.point(width, 0);
  const tr = g.point(width, height);
  const tl = g.point(0, height);

  // Sides
  const bottom = g.line(bl, br, 'bottom');
  const right = g.line(br, tr, 'right');
  const top = g.line(tr, tl, 'top');
  const left = g.line(tl, bl, 'left');

  if (!allowRotation) {
    g.fixRotation();
  }

  const handle = g.done();

  // Shape for dimensional shape constraints
  const shapeId = sk.shape([bottom, right, top, left]);

  // Register closed loop for sketch generation
  sk.addLoop([bl, br, tr, tl]);

  return {
    ...handle,
    bottomLeft: bl,
    bottomRight: br,
    topRight: tr,
    topLeft: tl,
    bottom,
    right,
    top,
    left,
    shape: shapeId,
  };
}

// ─── Builder convenience method ───────────────────────────────────────────────

declare module '../builder' {
  interface ConstrainedSketchBuilder {
    /**
     * Add a rigid rectangle as a group concept.
     * Returns a `ConstrainedGroupRect` handle with named vertices and sides.
     * The rectangle is fixed in shape — only position (and optionally rotation) varies.
     */
    groupRect(options: GroupRectOptions): ConstrainedGroupRect;
  }
}

(ConstrainedSketchBuilder.prototype as any).groupRect = function (
  this: ConstrainedSketchBuilder,
  options: GroupRectOptions,
): ConstrainedGroupRect {
  return addGroupRect(this, options);
};

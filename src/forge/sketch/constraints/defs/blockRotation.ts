/**
 * Thin TS constraint descriptor for `blockRotation`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, SketchPoint, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Prevents 180° rotation of a polygon by ensuring the first edge
     * (p0 → p1) maintains its initial direction sign.
     *
     * For an axis-aligned rectangle [bl, br, tr, tl], this guarantees
     * `br.x > bl.x` — i.e. the "bottom" edge points rightward (+x).
     * Without this, a rect can satisfy CCW winding while being inside-out
     * (negative width AND negative height → positive area → CCW blind spot).
     *
     * Rust treats this as an orientation guard with `equations: 0`, so it
     * preserves the intended branch without claiming an extra continuous DOF.
     *
     * The constraint stores `axis: 'x' | 'y'` — which coordinate of the
     * first edge must increase. For rects, this is `'x'` (bottom goes right).
     */
    blockRotation: { points: PointId[]; axis: 'x' | 'y' };
  }
}

registerConstraint<'blockRotation', ConstraintTypeMap['blockRotation']>({
  type: 'blockRotation',
  label: '⊡',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 2) return [0, 0];
    return [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
  },

  displayAnnotations() {
    return []; // No visual annotation — structural constraint
  },
});

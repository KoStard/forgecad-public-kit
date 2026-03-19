/**
 * Thin TS constraint descriptor for `ccw`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, SketchPoint, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Enforces counter-clockwise winding order on a polygon defined by `points`.
     *
     * This resolves the discrete orientation ambiguity that arises when a polygon's
     * shape is fully determined but its mirror image also satisfies all constraints
     * (e.g. an equilateral triangle with a fixed vertex and side angle).
     *
     * Rust owns the actual branch handling and one-sided residual logic.
     * `equations: 0` is intentional: this constraint removes the mirror branch
     * without claiming an extra continuous degree of freedom.
     */
    ccw: { points: PointId[] };
  }
}

registerConstraint<'ccw', ConstraintTypeMap['ccw']>({
  type: 'ccw',
  label: '↺',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 3) return [0, 0];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [cx, cy] as [number, number];
  },

  displayAnnotations(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 3) return [];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [{ kind: 'symbol', position: [cx, cy] as [number, number], symbol: 'ccw' as const }];
  },
});

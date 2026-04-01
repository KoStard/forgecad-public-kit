/**
 * Thin TS constraint descriptor for `pointLineDistance`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains the signed perpendicular distance from a point to an infinite line.
     *
     * Positive `value` places the point to the **left** of the line
     * (when facing the line's direction from `a` to `b`). Negative places it
     * to the right. Zero is equivalent to `collinear`.
     * Contributes **1 equation**: `perpDist(point, line) − value = 0`.
     */
    pointLineDistance: { point: PointId; line: LineId; value: number };
  }
}

registerConstraint<'pointLineDistance', ConstraintTypeMap['pointLineDistance']>({
  type: 'pointLineDistance',
  label: '↗',
  isDimension: true,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x + 2.5, pt.y + 2.5];
    return [0, 0];
  },

  displayAnnotations(c, { lines, points }): AnnotationElement[] {
    const pt = points.get(c.point);
    const line = lines.get(c.line);
    if (!pt || !line) return [];
    const a = points.get(line.a),
      b = points.get(line.b);
    if (!a || !b) return [];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 1e-9 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2 : 0;
    const proj: [number, number] = [a.x + t * dx, a.y + t * dy];
    return [{ kind: 'dimension', from: [pt.x, pt.y], to: proj, offset: 0, value: String(c.value) }];
  },
});

import type { PointId, CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to lie exactly on the circumference of a circle.
     *
     * The point is moved radially so its distance from the center equals the
     * radius. Contributes **1 equation**: `|point − center| − radius = 0`.
     */
    pointOnCircle: { point: PointId; circle: CircleId };
  }
}

registerConstraint<'pointOnCircle', ConstraintTypeMap['pointOnCircle']>({
  type: 'pointOnCircle',
  label: '◎',
  isDimension: false,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x, pt.y];
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'collinear' as const }];
  },});

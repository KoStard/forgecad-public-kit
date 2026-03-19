import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to lie on a **bounded** line segment — not merely the
     * infinite extension of the line.
     *
     * The point is projected onto the segment and the parameter `t` is clamped
     * to `[0, 1]`.  When `t` is already inside that range the behaviour is
     * identical to `collinear`.  When the point would project outside the
     * segment it is snapped to the nearest endpoint instead.
     *
     * Contributes **1 equation** (like `collinear`): the point can still slide
     * along the segment, giving it one remaining degree of freedom.
     */
    pointOnLine: { point: PointId; line: LineId };
  }
}

registerConstraint<'pointOnLine', ConstraintTypeMap['pointOnLine']>({
  type: 'pointOnLine',
  label: '⋅',
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

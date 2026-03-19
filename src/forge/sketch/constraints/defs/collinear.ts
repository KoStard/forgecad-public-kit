import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { projectPointToLine } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to lie on the infinite line passing through a line segment.
     *
     * The point is projected onto the line's infinite extension (not clamped to
     * the segment). Contributes **1 equation**: signed distance from the point
     * to the line = 0.
     */
    collinear: { point: PointId; line: LineId };
  }
}

registerConstraint<'collinear', ConstraintTypeMap['collinear']>({
  type: 'collinear',
  label: '⋯',
  isDimension: false,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x + 2.5, pt.y + 2.5];
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x + 2.5, pt.y + 2.5] as [number, number], symbol: 'collinear' as const }];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

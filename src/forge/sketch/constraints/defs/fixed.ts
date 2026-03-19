import type { PointId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Pins a point to an absolute position `(x, y)` in sketch space.
     *
     * Applied during the **presolve** pass (before iteration), not as a
     * per-iteration equation. The point's `fixed` flag is set to `true` so
     * other constraints treat it as immovable. Contributes **0 equations**
     * to the DOF count because the DOF is removed by setting `pt.fixed`.
     */
    fixed: { point: PointId; x: number; y: number };
  }
}

registerConstraint<'fixed', ConstraintTypeMap['fixed']>({
  type: 'fixed',
  label: '⚓',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x + 2.5, pt.y + 2.5];
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x + 2.5, pt.y + 2.5] as [number, number], symbol: 'fixed' as const }];
  },});

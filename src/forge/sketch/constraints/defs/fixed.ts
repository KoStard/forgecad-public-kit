import type { PointId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    fixed: { point: PointId; x: number; y: number };
  }
}

registerConstraint<'fixed', ConstraintTypeMap['fixed']>({
  type: 'fixed',
  label: 'FIX',
  isDimension: false,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x, pt.y];
    return [0, 0];
  },

  presolve(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return;
    pt.fixed = true;
    pt.x = c.x;
    pt.y = c.y;
  },

  solve(_c, _ctx) {
    // Applied in presolve — nothing to do per-iteration
    return 0;
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 2);
  },
});

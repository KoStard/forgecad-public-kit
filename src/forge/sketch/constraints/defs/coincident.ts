import type { PointId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two points to occupy the same position.
     *
     * This is the most fundamental connectivity constraint — use it to join
     * line endpoints, close a polygon, or snap a point to another point.
     * Contributes **2 equations** (one per axis).
     */
    coincident: { a: PointId; b: PointId };
  }
}

registerConstraint<'coincident', ConstraintTypeMap['coincident']>({
  type: 'coincident',
  label: 'COINC',
  isDimension: false,
  equations: 2,

  displayPosition(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (a && b) return midpoint(a, b);
    return [0, 0];
  },

  solve(c, { points, tolerance }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (!a || !b) return 0;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const err = Math.sqrt(dx * dx + dy * dy);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    if (a.fixed) { b.x = a.x; b.y = a.y; return err; }
    if (b.fixed) { a.x = b.x; a.y = b.y; return err; }
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    a.x = mx; a.y = my;
    b.x = mx; b.y = my;
    return err;
  },


  residual(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (!a || !b) return [0, 0];
    return [b.x - a.x, b.y - a.y];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

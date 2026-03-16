import type { PointId, LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, reflectPointAcrossLine } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    symmetric: { a: PointId; b: PointId; axis: LineId };
  }
}

registerConstraint<'symmetric', ConstraintTypeMap['symmetric']>({
  type: 'symmetric',
  label: 'SYM',
  isDimension: false,

  displayPosition(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (a && b) return midpoint(a, b);
    return [0, 0];
  },

  solve(c, { points, lines, tolerance }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    const axis = lines.get(c.axis);
    if (!a || !b || !axis) return 0;
    const ax1 = points.get(axis.a);
    const ax2 = points.get(axis.b);
    if (!ax1 || !ax2) return 0;
    const ra = reflectPointAcrossLine(a, ax1, ax2);
    const rb = reflectPointAcrossLine(b, ax1, ax2);
    const err = Math.sqrt((b.x - ra[0]) ** 2 + (b.y - ra[1]) ** 2);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    if (a.fixed) {
      b.x = ra[0]; b.y = ra[1];
    } else if (b.fixed) {
      a.x = rb[0]; a.y = rb[1];
    } else {
      b.x = ra[0]; b.y = ra[1];
    }
    return err;
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

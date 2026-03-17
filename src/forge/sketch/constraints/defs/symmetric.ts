import type { PointId, LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, reflectPointAcrossLine } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces points `a` and `b` to be mirror images of each other across
     * the infinite line through `axis`.
     *
     * When neither point is fixed, `b` is moved to the reflection of `a`.
     * When `b` is fixed, `a` is moved instead. Contributes **2 equations**
     * (one per axis): `b − reflect(a, axis) = [0, 0]`.
     */
    symmetric: { a: PointId; b: PointId; axis: LineId };
  }
}

registerConstraint<'symmetric', ConstraintTypeMap['symmetric']>({
  type: 'symmetric',
  label: 'SYM',
  isDimension: false,
  equations: 2,

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


  residual(c, { points, lines }) {
    const a = points.get(c.a); const b = points.get(c.b);
    const axis = lines.get(c.axis);
    if (!a || !b || !axis) return [0, 0];
    const ax1 = points.get(axis.a); const ax2 = points.get(axis.b);
    if (!ax1 || !ax2) return [0, 0];
    // Reflect a across axis
    const dx = ax2.x - ax1.x; const dy = ax2.y - ax1.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = ((a.x - ax1.x) * dx + (a.y - ax1.y) * dy) / len2;
    const px = ax1.x + t * dx; const py = ax1.y + t * dy;
    const rx = 2 * px - a.x; const ry = 2 * py - a.y;
    return [b.x - rx, b.y - ry];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

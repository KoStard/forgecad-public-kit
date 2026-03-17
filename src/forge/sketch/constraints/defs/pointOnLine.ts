import type { PointId, LineId, ConstraintTypeMap } from '../types';
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
  label: 'POL',
  isDimension: false,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x, pt.y];
    return [0, 0];
  },

  solve(c, { points, lines, movePoint, tolerance }) {
    const pt = points.get(c.point);
    const line = lines.get(c.line);
    if (!pt || !line) return 0;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return 0;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return 0;

    const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
    const tc = Math.max(0, Math.min(1, t));
    const projX = a.x + tc * dx;
    const projY = a.y + tc * dy;

    const err = Math.sqrt((pt.x - projX) ** 2 + (pt.y - projY) ** 2);
    if (err <= tolerance) return err;

    if (!pt.fixed) {
      pt.x = projX;
      pt.y = projY;
    } else {
      const ddx = projX - pt.x;
      const ddy = projY - pt.y;
      if (!a.fixed) movePoint(a, -ddx, -ddy);
      if (!b.fixed) movePoint(b, -ddx, -ddy);
    }
    return err;
  },

  residual(c, { points, lines }) {
    const pt = points.get(c.point);
    const line = lines.get(c.line);
    if (!pt || !line) return [0];
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return [0];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return [0];
    const len = Math.sqrt(len2);

    const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;

    if (t < 0) {
      // Point projects before endpoint a — return negative distance so NR
      // drives it toward a.
      return [-Math.hypot(pt.x - a.x, pt.y - a.y)];
    }
    if (t > 1) {
      // Point projects past endpoint b — return positive distance so NR
      // drives it toward b.
      return [Math.hypot(pt.x - b.x, pt.y - b.y)];
    }
    // Interior: signed perpendicular distance to the infinite line (same as collinear).
    return [((pt.x - a.x) * dy - (pt.y - a.y) * dx) / len];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

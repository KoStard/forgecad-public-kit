import type { PointId, LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to lie on a finite line segment (between its two endpoints).
     *
     * Unlike `collinear`, the projection is clamped to the segment's extent
     * (`t ∈ [0, 1]`), so the point cannot slide off either end.
     * Contributes **1 equation**: signed perpendicular distance = 0.
     */
    pointOnLine: { point: PointId; line: LineId };
  }
}

registerConstraint<'pointOnLine', ConstraintTypeMap['pointOnLine']>({
  type: 'pointOnLine',
  label: 'ON',
  isDimension: false,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x + 2.5, pt.y + 2.5];
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

    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
    const px = a.x + t * dx;
    const py = a.y + t * dy;

    const err = Math.hypot(pt.x - px, pt.y - py);
    if (err <= tolerance) return err;

    if (!pt.fixed) {
      pt.x = px;
      pt.y = py;
    } else {
      // Point is fixed — translate the segment endpoints to satisfy the constraint.
      const shiftX = px - pt.x;
      const shiftY = py - pt.y;
      if (!a.fixed) movePoint(a, -shiftX, -shiftY);
      if (!b.fixed) movePoint(b, -shiftX, -shiftY);
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
    const len = Math.hypot(dx, dy) || 1;
    return [((pt.x - a.x) * dy - (pt.y - a.y) * dx) / len];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

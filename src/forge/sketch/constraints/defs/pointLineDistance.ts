import type { PointId, LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains the signed perpendicular distance from a point to an infinite line.
     *
     * Positive `value` places the point to the **left** of the line
     * (when facing the line's direction from `a` to `b`). Negative places it
     * to the right. Zero is equivalent to `collinear`.
     * Contributes **1 equation**: `perpDist(point, line) − value = 0`.
     */
    pointLineDistance: { point: PointId; line: LineId; value: number };
  }
}

registerConstraint<'pointLineDistance', ConstraintTypeMap['pointLineDistance']>({
  type: 'pointLineDistance',
  label: 'PDIST',
  isDimension: true,
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
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return 0;

    // Left-normal: (-dy, dx) / len
    const nx = -dy / len;
    const ny = dx / len;

    const current = (pt.x - a.x) * nx + (pt.y - a.y) * ny;
    const err = Math.abs(current - c.value);
    if (err <= tolerance) return err;

    const shift = c.value - current;
    if (!pt.fixed) {
      pt.x += nx * shift;
      pt.y += ny * shift;
    } else {
      // Point is fixed — translate the line instead
      if (!a.fixed) movePoint(a, -nx * shift, -ny * shift);
      if (!b.fixed) movePoint(b, -nx * shift, -ny * shift);
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
    const nx = -dy / len;
    const ny = dx / len;
    return [(pt.x - a.x) * nx + (pt.y - a.y) * ny - c.value];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

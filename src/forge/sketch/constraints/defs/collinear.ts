import type { PointId, LineId, ConstraintTypeMap } from '../types';
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
  label: 'COLL',
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
    const proj = projectPointToLine(pt, a, b);
    const err = Math.sqrt((pt.x - proj[0]) ** 2 + (pt.y - proj[1]) ** 2);
    if (err <= tolerance) return err;
    if (!pt.fixed) {
      pt.x = proj[0];
      pt.y = proj[1];
    } else {
      const dx = proj[0] - pt.x;
      const dy = proj[1] - pt.y;
      if (!a.fixed) movePoint(a, -dx, -dy);
      if (!b.fixed) movePoint(b, -dx, -dy);
    }
    return err;
  },


  residual(c, { points, lines }) {
    const pt = points.get(c.point); const line = lines.get(c.line);
    if (!pt || !line) return [0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Signed distance from pt to the infinite line
    return [((pt.x - a.x) * dy - (pt.y - a.y) * dx) / len];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

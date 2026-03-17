import type { PointId, LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to sit at the exact midpoint of a line segment.
     *
     * When the midpoint is free the solver snaps it to `(a + b) / 2`. When the
     * midpoint is fixed both line endpoints are translated equally to place their
     * midpoint at the fixed position. Contributes **2 equations**
     * (one per axis): `point − (a + b) / 2 = [0, 0]`.
     */
    midpoint: { point: PointId; line: LineId };
  }
}

registerConstraint<'midpoint', ConstraintTypeMap['midpoint']>({
  type: 'midpoint',
  label: 'MID',
  isDimension: false,
  equations: 2,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (line) {
      const a = points.get(line.a);
      const b = points.get(line.b);
      if (a && b) return midpoint(a, b);
    }
    return [0, 0];
  },

  solve(c, { points, lines, tolerance }) {
    const pt = points.get(c.point);
    const line = lines.get(c.line);
    if (!pt || !line) return 0;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return 0;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const err = Math.sqrt((pt.x - mx) ** 2 + (pt.y - my) ** 2);
    if (err <= tolerance) return err;
    if (!pt.fixed) {
      pt.x = mx;
      pt.y = my;
    } else {
      const dx = pt.x - mx;
      const dy = pt.y - my;
      if (!a.fixed) { a.x += dx; a.y += dy; }
      if (!b.fixed) { b.x += dx; b.y += dy; }
    }
    return err;
  },


  residual(c, { points, lines }) {
    const pt = points.get(c.point); const line = lines.get(c.line);
    if (!pt || !line) return [0, 0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0, 0];
    return [pt.x - (a.x + b.x) / 2, pt.y - (a.y + b.y) / 2];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 2);
  },
});

import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp } from '../helpers';

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
  label: '◆',
  isDimension: false,
  equations: 2,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (line) {
      const a = points.get(line.a);
      const b = points.get(line.b);
      if (a && b) return midpointPerp(a, b, 3);
    }
    return [0, 0];
  },

  displayAnnotations(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [];
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [];
    return [{ kind: 'symbol', position: [(a.x+b.x)/2, (a.y+b.y)/2] as [number, number], symbol: 'midpoint' as const }];
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
    const dx = pt.x - mx;
    const dy = pt.y - my;
    const err = Math.sqrt(dx * dx + dy * dy);
    if (err <= tolerance) return err;
    if (pt.fixed) {
      // Point is anchored — move line endpoints to center on it.
      if (!a.fixed) { a.x += dx; a.y += dy; }
      if (!b.fixed) { b.x += dx; b.y += dy; }
    } else {
      // Snap point to the midpoint of the line.
      pt.x = mx;
      pt.y = my;
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

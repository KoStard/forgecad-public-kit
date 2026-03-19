import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
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
  label: '⋯',
  isDimension: false,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x + 2.5, pt.y + 2.5];
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'collinear' as const }];
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

  jacobian(c, { points, lines }) {
    const pt = points.get(c.point); const line = lines.get(c.line);
    if (!pt || !line) return { residuals: [0], partials: {} };
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return { residuals: [0], partials: {} };
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-24;
    const len = Math.sqrt(len2);
    const px = pt.x - a.x, py = pt.y - a.y;
    const N = px * dy - py * dx;
    const r = N / len;
    return {
      residuals: [r],
      partials: {
        [`${c.point}.x`]: [dy / len],
        [`${c.point}.y`]: [-dx / len],
        [`${line.a}.x`]: [(py - dy) / len + r * dx / len2],
        [`${line.a}.y`]: [(dx - px) / len + r * dy / len2],
        [`${line.b}.x`]: [-py / len - r * dx / len2],
        [`${line.b}.y`]: [px / len - r * dy / len2],
      },
    };
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

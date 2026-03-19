import type { PointId, CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to lie exactly on the circumference of a circle.
     *
     * The point is moved radially so its distance from the center equals the
     * radius. Contributes **1 equation**: `|point − center| − radius = 0`.
     */
    pointOnCircle: { point: PointId; circle: CircleId };
  }
}

registerConstraint<'pointOnCircle', ConstraintTypeMap['pointOnCircle']>({
  type: 'pointOnCircle',
  label: '◎',
  isDimension: false,
  equations: 1,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x, pt.y];
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'collinear' as const }];
  },

  solve(c, { points, circles, tolerance }) {
    const pt = points.get(c.point);
    const circle = circles.get(c.circle);
    if (!pt || !circle) return 0;
    const center = points.get(circle.center);
    if (!center) return 0;
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const err = Math.abs(dist - circle.radius);
    if (err <= tolerance) return err;
    if (!pt.fixed) {
      pt.x = center.x + (dx / dist) * circle.radius;
      pt.y = center.y + (dy / dist) * circle.radius;
    } else if (!center.fixed) {
      center.x = pt.x - (dx / dist) * circle.radius;
      center.y = pt.y - (dy / dist) * circle.radius;
    }
    return err;
  },


  residual(c, { points, circles }) {
    const pt = points.get(c.point); const circle = circles.get(c.circle);
    if (!pt || !circle) return [0];
    const center = points.get(circle.center);
    if (!center) return [0];
    return [Math.hypot(pt.x - center.x, pt.y - center.y) - circle.radius];
  },

  jacobian(c, { points, circles }) {
    const pt = points.get(c.point); const circle = circles.get(c.circle);
    if (!pt || !circle) return { residuals: [0], partials: {} };
    const center = points.get(circle.center);
    if (!center) return { residuals: [0], partials: {} };
    const dx = pt.x - center.x, dy = pt.y - center.y;
    const d = Math.hypot(dx, dy) || 1e-12;
    const ux = dx / d, uy = dy / d;
    return {
      residuals: [d - circle.radius],
      partials: {
        [`${c.point}.x`]: [ux],
        [`${c.point}.y`]: [uy],
        [`${circle.center}.x`]: [-ux],
        [`${circle.center}.y`]: [-uy],
        [`${c.circle}.r`]: [-1],
      },
    };
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 1);
  },
});

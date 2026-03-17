import type { CircleId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    radius: { circle: CircleId; value: number };
  }
}

registerConstraint<'radius', ConstraintTypeMap['radius']>({
  type: 'radius',
  label: 'R',
  isDimension: true,
  equations: 1,

  displayPosition(c, { circles, points }) {
    const circle = circles.get(c.circle);
    if (circle) {
      const center = points.get(circle.center);
      if (center) return [center.x + circle.radius, center.y];
    }
    return [0, 0];
  },

  solve(c, { circles, tolerance }) {
    const circle = circles.get(c.circle);
    if (!circle) return 0;
    const err = Math.abs(circle.radius - c.value);
    if (err <= tolerance) return err;
    if (!circle.fixedRadius) circle.radius = c.value;
    return err;
  },


  residual(c, { circles }) {
    const circle = circles.get(c.circle);
    if (!circle) return [0];
    return [circle.radius - c.value];
  },

  computeDof(_c, _ctx) {
    // radius constrains circle radius (not a point DOF)
  },
});

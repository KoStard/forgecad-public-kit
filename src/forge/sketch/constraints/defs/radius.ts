import type { CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the radius of a circle to `value`.
     *
     * Has no effect if the circle's `fixedRadius` flag is set.
     * Contributes **1 equation**: `radius − value = 0`.
     */
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

  displayAnnotations(c, { circles, points }): AnnotationElement[] {
    const circle = circles.get(c.circle);
    if (!circle) return [];
    const center = points.get(circle.center);
    if (!center) return [];
    return [{ kind: 'dimension', from: [center.x, center.y], to: [center.x + circle.radius, center.y], offset: 0, value: `R${c.value}` }];
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

  jacobian(c, { circles }) {
    const circle = circles.get(c.circle);
    if (!circle) return { residuals: [0], partials: {} };
    return {
      residuals: [circle.radius - c.value],
      partials: {
        [`${c.circle}.r`]: [1],
      },
    };
  },

  computeDof(_c, _ctx) {
    // radius constrains circle radius (not a point DOF)
  },
});

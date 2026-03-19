import type { CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the diameter of a circle to `value` (i.e. `radius = value / 2`).
     *
     * Has no effect if the circle's `fixedRadius` flag is set.
     * Contributes **1 equation**: `radius − value / 2 = 0`.
     */
    diameter: { circle: CircleId; value: number };
  }
}

registerConstraint<'diameter', ConstraintTypeMap['diameter']>({
  type: 'diameter',
  label: '⌀',
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
    return [{ kind: 'dimension', from: [center.x - circle.radius, center.y], to: [center.x + circle.radius, center.y], offset: 0, value: `⌀${c.value}` }];
  },

  computeDof(_c, _ctx) {
    // diameter constrains circle radius (not a point DOF)
  },
});

/**
 * Thin TS constraint descriptor for `equalRadius`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two circles to have the same radius.
     *
     * Rust enforces one scalar equality: `radius_b - radius_a = 0`.
     */
    equalRadius: { a: CircleId; b: CircleId };
  }
}

registerConstraint<'equalRadius', ConstraintTypeMap['equalRadius']>({
  type: 'equalRadius',
  label: '=R',
  isDimension: false,
  equations: 1,

  displayPosition(c, { circles, points }) {
    const ca = circles.get(c.a);
    const cb = circles.get(c.b);
    if (ca && cb) {
      const pa = points.get(ca.center);
      const pb = points.get(cb.center);
      if (pa && pb) return [(pa.x + pb.x) / 2 + ca.radius, (pa.y + pb.y) / 2];
    }
    return [0, 0];
  },

  displayAnnotations(c, { circles, points }) {
    const annotations: AnnotationElement[] = [];
    for (const circleId of [c.a, c.b]) {
      const circle = circles.get(circleId);
      if (!circle) continue;
      const center = points.get(circle.center);
      if (!center) continue;
      annotations.push({ kind: 'symbol', position: [center.x + circle.radius, center.y], symbol: 'equal' });
    }
    return annotations;
  },
});

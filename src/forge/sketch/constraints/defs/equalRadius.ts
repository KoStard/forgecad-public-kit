import type { CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two circles to have the same radius.
     *
     * When both radii are free they are averaged. When one has `fixedRadius`
     * the other is snapped to it. Contributes **1 equation**:
     * `radius_b − radius_a = 0`.
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

  solve(c, { circles, tolerance }) {
    const ca = circles.get(c.a);
    const cb = circles.get(c.b);
    if (!ca || !cb) return 0;
    const err = Math.abs(ca.radius - cb.radius);
    if (err <= tolerance) return err;

    if (!ca.fixedRadius && !cb.fixedRadius) {
      const avg = (ca.radius + cb.radius) / 2;
      ca.radius = avg;
      cb.radius = avg;
    } else if (ca.fixedRadius) {
      if (!cb.fixedRadius) cb.radius = ca.radius;
    } else {
      ca.radius = cb.radius;
    }
    return err;
  },


  residual(c, { circles }) {
    const ca = circles.get(c.a); const cb = circles.get(c.b);
    if (!ca || !cb) return [0];
    return [cb.radius - ca.radius];
  },

  computeDof(_c, _ctx) {
    // Constrains circle radii, not point DOF
  },
});

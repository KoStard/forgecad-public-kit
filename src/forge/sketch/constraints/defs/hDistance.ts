import type { PointId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the signed horizontal distance from point `a` to point `b` to `value`.
     *
     * The constraint is directional: `b.x − a.x = value`. A positive value places
     * `b` to the right of `a`; negative places it to the left.
     * Contributes **1 equation**.
     */
    hDistance: { a: PointId; b: PointId; value: number };
  }
}

registerConstraint<'hDistance', ConstraintTypeMap['hDistance']>({
  type: 'hDistance',
  label: 'HD',
  isDimension: true,
  equations: 1,

  displayPosition(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (a && b) return midpoint(a, b);
    return [0, 0];
  },

  displayAnnotations(c, { points }): AnnotationElement[] {
    const a = points.get(c.a), b = points.get(c.b);
    if (!a || !b) return [];
    return [{ kind: 'dimension', from: [a.x, a.y], to: [b.x, a.y], offset: 3, value: String(c.value) }];
  },

  solve(c, { points, tolerance }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (!a || !b) return 0;
    const err = Math.abs((b.x - a.x) - c.value);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    if (a.fixed) {
      b.x = a.x + c.value;
    } else if (b.fixed) {
      a.x = b.x - c.value;
    } else {
      const midX = (a.x + b.x) / 2;
      a.x = midX - c.value / 2;
      b.x = midX + c.value / 2;
    }
    return err;
  },


  residual(c, { points }) {
    const a = points.get(c.a); const b = points.get(c.b);
    if (!a || !b) return [0];
    return [b.x - a.x - c.value];
  },

  jacobian(c, { points }) {
    const a = points.get(c.a); const b = points.get(c.b);
    if (!a || !b) return { residuals: [0], partials: {} };
    return {
      residuals: [b.x - a.x - c.value],
      partials: {
        [`${c.a}.x`]: [-1],
        [`${c.b}.x`]: [1],
      },
    };
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

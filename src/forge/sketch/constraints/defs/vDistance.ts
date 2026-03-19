import type { PointId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the signed vertical distance from point `a` to point `b` to `value`.
     *
     * The constraint is directional: `b.y − a.y = value`. A positive value places
     * `b` above `a`; negative places it below.
     * Contributes **1 equation**.
     */
    vDistance: { a: PointId; b: PointId; value: number };
  }
}

registerConstraint<'vDistance', ConstraintTypeMap['vDistance']>({
  type: 'vDistance',
  label: 'VD',
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
    return [{ kind: 'dimension', from: [a.x, a.y], to: [a.x, b.y], offset: 3, value: String(c.value) }];
  },

  solve(c, { points, tolerance }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (!a || !b) return 0;
    const err = Math.abs((b.y - a.y) - c.value);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    if (a.fixed) {
      b.y = a.y + c.value;
    } else if (b.fixed) {
      a.y = b.y - c.value;
    } else {
      const midY = (a.y + b.y) / 2;
      a.y = midY - c.value / 2;
      b.y = midY + c.value / 2;
    }
    return err;
  },


  residual(c, { points }) {
    const a = points.get(c.a); const b = points.get(c.b);
    if (!a || !b) return [0];
    return [b.y - a.y - c.value];
  },

  jacobian(c, { points }) {
    const a = points.get(c.a); const b = points.get(c.b);
    if (!a || !b) return { residuals: [0], partials: {} };
    return {
      residuals: [b.y - a.y - c.value],
      partials: {
        [`${c.a}.y`]: [-1],
        [`${c.b}.y`]: [1],
      },
    };
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

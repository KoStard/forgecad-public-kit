import type { PointId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the Euclidean distance between two points to `value`.
     *
     * Points are moved symmetrically along the current direction vector so the
     * center of the pair stays fixed. Contributes **1 equation**:
     * `|b − a| − value = 0`.
     */
    distance: { a: PointId; b: PointId; value: number };
  }
}

registerConstraint<'distance', ConstraintTypeMap['distance']>({
  type: 'distance',
  label: '↔',
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
    return [{ kind: 'dimension', from: [a.x, a.y], to: [b.x, b.y], offset: 3, value: String(c.value) }];
  },

  solve(c, { points, tolerance }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (!a || !b) return 0;
    const len = distance(a, b) || 1;
    const err = Math.abs(len - c.value);
    if (err <= tolerance) return err;
    const dir: [number, number] = [(b.x - a.x) / len, (b.y - a.y) / len];
    if (a.fixed && b.fixed) return err;
    if (a.fixed) {
      b.x = a.x + dir[0] * c.value; b.y = a.y + dir[1] * c.value;
    } else if (b.fixed) {
      a.x = b.x - dir[0] * c.value; a.y = b.y - dir[1] * c.value;
    } else {
      const mid = midpoint(a, b);
      a.x = mid[0] - dir[0] * c.value / 2; a.y = mid[1] - dir[1] * c.value / 2;
      b.x = mid[0] + dir[0] * c.value / 2; b.y = mid[1] + dir[1] * c.value / 2;
    }
    return err;
  },


  residual(c, { points }) {
    const a = points.get(c.a); const b = points.get(c.b);
    if (!a || !b) return [0];
    return [Math.hypot(b.x - a.x, b.y - a.y) - c.value];
  },

  jacobian(c, { points }) {
    const a = points.get(c.a); const b = points.get(c.b);
    if (!a || !b) return { residuals: [0], partials: {} };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-12;
    const ux = dx / d;
    const uy = dy / d;
    return {
      residuals: [d - c.value],
      partials: {
        [`${c.a}.x`]: [-ux],
        [`${c.a}.y`]: [-uy],
        [`${c.b}.x`]: [ux],
        [`${c.b}.y`]: [uy],
      },
    };
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

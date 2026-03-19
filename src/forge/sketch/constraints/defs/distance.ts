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

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

import type { PointId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two points to occupy the same position.
     *
     * This is the most fundamental connectivity constraint — use it to join
     * line endpoints, close a polygon, or snap a point to another point.
     * Contributes **2 equations** (one per axis).
     */
    coincident: { a: PointId; b: PointId };
  }
}

registerConstraint<'coincident', ConstraintTypeMap['coincident']>({
  type: 'coincident',
  label: '⊙',
  isDimension: false,
  equations: 2,

  displayPosition(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (a && b) return midpoint(a, b);
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const a = points.get(c.a), b = points.get(c.b);
    if (!a || !b) return [];
    return [{ kind: 'symbol', position: [(a.x+b.x)/2, (a.y+b.y)/2] as [number, number], symbol: 'coincident' as const }];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});

/**
 * Thin TS constraint descriptor for `concentric`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two circles to share the same center point.
     *
     * The centers are merged to their average position (or snapped to the fixed
     * one if either is fixed). Contributes **2 equations**
     * (one per axis): `center_b − center_a = [0, 0]`.
     */
    concentric: { a: CircleId; b: CircleId };
  }
}

registerConstraint<'concentric', ConstraintTypeMap['concentric']>({
  type: 'concentric',
  label: '⊚',
  isDimension: false,
  equations: 2,

  displayPosition(c, { circles, points }) {
    const c1 = circles.get(c.a);
    const c2 = circles.get(c.b);
    if (c1 && c2) {
      const p1 = points.get(c1.center);
      const p2 = points.get(c2.center);
      if (p1 && p2) return midpoint(p1, p2);
    }
    return [0, 0];
  },

  displayAnnotations(c, { circles, points }) {
    const c1 = circles.get(c.a);
    const c2 = circles.get(c.b);
    if (!c1 || !c2) return [];
    const p1 = points.get(c1.center);
    const p2 = points.get(c2.center);
    if (!p1 || !p2) return [];
    return [{ kind: 'symbol', position: [(p1.x+p2.x)/2, (p1.y+p2.y)/2] as [number, number], symbol: 'concentric' as const }];
  },
});

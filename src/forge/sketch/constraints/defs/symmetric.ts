/**
 * Thin TS constraint descriptor for `symmetric`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces points `a` and `b` to be mirror images of each other across
     * the infinite line through `axis`.
     *
     * When neither point is fixed, `b` is moved to the reflection of `a`.
     * When `b` is fixed, `a` is moved instead. Contributes **2 equations**
     * (one per axis): `b − reflect(a, axis) = [0, 0]`.
     */
    symmetric: { a: PointId; b: PointId; axis: LineId };
  }
}

registerConstraint<'symmetric', ConstraintTypeMap['symmetric']>({
  type: 'symmetric',
  label: '⟷',
  isDimension: false,
  equations: 2,

  displayPosition(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (a && b) return midpoint(a, b);
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const a = points.get(c.a),
      b = points.get(c.b);
    const annotations: AnnotationElement[] = [];
    if (a) annotations.push({ kind: 'symbol', position: [a.x, a.y], symbol: 'symmetric' });
    if (b) annotations.push({ kind: 'symbol', position: [b.x, b.y], symbol: 'symmetric' });
    return annotations;
  },
});

import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeCentroid } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two shapes to share the same centroid.
     *
     * Translates the non-fixed vertices of each shape so that their arithmetic
     * centroids coincide at the mean of the two current centroids.
     * Contributes **2 equations**: `cx(a) − cx(b) = 0` and `cy(a) − cy(b) = 0`.
     */
    shapeEqualCentroid: { a: ShapeId; b: ShapeId };
  }
}

registerConstraint<'shapeEqualCentroid', ConstraintTypeMap['shapeEqualCentroid']>({
  type: 'shapeEqualCentroid',
  label: '⊕',
  isDimension: false,
  equations: 2,

  displayPosition(c, { shapes, lines, points }) {
    const shapeA = shapes.get(c.a);
    const shapeB = shapes.get(c.b);
    if (!shapeA || !shapeB) return [0, 0];
    const [ax, ay] = shapeCentroid(shapeVertices(shapeA, lines, points));
    const [bx, by] = shapeCentroid(shapeVertices(shapeB, lines, points));
    return [(ax + bx) / 2, (ay + by) / 2];
  },});

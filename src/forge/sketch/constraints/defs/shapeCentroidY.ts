/**
 * Thin TS constraint descriptor for `shapeCentroidY`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeCentroid } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the Y coordinate of a polygon's arithmetic centroid to `value`.
     *
     * All non-fixed vertices are translated vertically by the same amount so
     * that `mean(vertices.y) = value`. The shape's size, proportions, and X
     * position are unaffected. Contributes **1 equation**.
     */
    shapeCentroidY: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeCentroidY', ConstraintTypeMap['shapeCentroidY']>({
  type: 'shapeCentroidY',
  label: 'CY',
  isDimension: true,
  equations: 1,

  displayPosition(c, { shapes, lines, points }) {
    const shape = shapes.get(c.shape);
    if (!shape) return [0, 0];
    const pts = shapeVertices(shape, lines, points);
    return shapeCentroid(pts);
  },
});

import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeBoundingBox } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the axis-aligned bounding-box width of a polygon shape to `value`.
     *
     * All non-fixed vertices are scaled horizontally (`x` only) from the
     * bounding-box center: `pt.x = cx + (pt.x − cx) × (value / width)`.
     * The shape's height and Y position are unaffected.
     * Contributes **1 equation**.
     */
    shapeWidth: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeWidth', ConstraintTypeMap['shapeWidth']>({
  type: 'shapeWidth',
  label: 'W',
  isDimension: true,
  equations: 1,

  displayPosition(c, { shapes, lines, points }) {
    const shape = shapes.get(c.shape);
    if (!shape) return [0, 0];
    const pts = shapeVertices(shape, lines, points);
    if (pts.length === 0) return [0, 0];
    const { cx, cy } = shapeBoundingBox(pts);
    return [cx, cy];
  },});

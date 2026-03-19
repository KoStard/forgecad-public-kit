import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeBoundingBox } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the axis-aligned bounding-box height of a polygon shape to `value`.
     *
     * All non-fixed vertices are scaled vertically (`y` only) from the
     * bounding-box center: `pt.y = cy + (pt.y − cy) × (value / height)`.
     * The shape's width and X position are unaffected.
     * Contributes **1 equation**.
     */
    shapeHeight: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeHeight', ConstraintTypeMap['shapeHeight']>({
  type: 'shapeHeight',
  label: 'H',
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

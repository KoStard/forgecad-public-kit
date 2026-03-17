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
  },

  solve(c, { shapes, lines, points, tolerance }) {
    const shape = shapes.get(c.shape);
    if (!shape) return 0;
    const pts = shapeVertices(shape, lines, points);
    if (pts.length === 0) return 0;
    const bbox = shapeBoundingBox(pts);
    const err = Math.abs(bbox.height - c.value);
    if (err <= tolerance) return err;
    if (bbox.height < 1e-9) return err;
    const scale = c.value / bbox.height;
    for (const pt of pts) {
      if (!pt.fixed) pt.y = bbox.cy + (pt.y - bbox.cy) * scale;
    }
    return err;
  },

  computeDof(c, { refCount, lines, shapes }) {
    const shape = shapes.get(c.shape);
    if (!shape) return;
    const seen = new Set<string>();
    for (const lineId of shape.lines) {
      const l = lines.find((ln) => ln.id === lineId);
      if (!l) continue;
      for (const ptId of [l.a, l.b]) {
        if (!seen.has(ptId)) { seen.add(ptId); refCount.set(ptId, (refCount.get(ptId) ?? 0) + 1); }
      }
    }
  },
});

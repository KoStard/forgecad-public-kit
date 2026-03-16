import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeBoundingBox } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    shapeWidth: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeWidth', ConstraintTypeMap['shapeWidth']>({
  type: 'shapeWidth',
  label: 'W',
  isDimension: true,

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
    const err = Math.abs(bbox.width - c.value);
    if (err <= tolerance) return err;
    if (bbox.width < 1e-9) return err;
    const scale = c.value / bbox.width;
    for (const pt of pts) {
      if (!pt.fixed) pt.x = bbox.cx + (pt.x - bbox.cx) * scale;
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

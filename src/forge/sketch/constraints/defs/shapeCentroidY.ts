import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeCentroid } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    shapeCentroidY: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeCentroidY', ConstraintTypeMap['shapeCentroidY']>({
  type: 'shapeCentroidY',
  label: 'CY',
  isDimension: true,

  displayPosition(c, { shapes, lines, points }) {
    const shape = shapes.get(c.shape);
    if (!shape) return [0, 0];
    const pts = shapeVertices(shape, lines, points);
    return shapeCentroid(pts);
  },

  solve(c, { shapes, lines, points, tolerance }) {
    const shape = shapes.get(c.shape);
    if (!shape) return 0;
    const pts = shapeVertices(shape, lines, points);
    if (pts.length === 0) return 0;
    const [, cy] = shapeCentroid(pts);
    const err = Math.abs(cy - c.value);
    if (err <= tolerance) return err;
    const shift = c.value - cy;
    for (const pt of pts) {
      if (!pt.fixed) pt.y += shift;
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

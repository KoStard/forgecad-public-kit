import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeCentroid } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the X coordinate of a polygon's arithmetic centroid to `value`.
     *
     * All non-fixed vertices are translated horizontally by the same amount so
     * that `mean(vertices.x) = value`. The shape's size, proportions, and Y
     * position are unaffected. Contributes **1 equation**.
     */
    shapeCentroidX: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeCentroidX', ConstraintTypeMap['shapeCentroidX']>({
  type: 'shapeCentroidX',
  label: 'CX',
  isDimension: true,
  equations: 1,

  displayPosition(c, { shapes, lines, points }) {
    const shape = shapes.get(c.shape);
    if (!shape) return [0, 0];
    const pts = shapeVertices(shape, lines, points);
    return shapeCentroid(pts);
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

import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeCentroid, traverseShapeVertices, polygonSignedArea } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the enclosed area of a polygon shape to `value`.
     *
     * Area is computed via the shoelace formula on the ordered vertex list.
     * All non-fixed vertices are scaled uniformly from the polygon's arithmetic
     * centroid: `scale = sqrt(target / current)`, so the shape's proportions
     * and position are preserved. Contributes **1 equation**.
     */
    shapeArea: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeArea', ConstraintTypeMap['shapeArea']>({
  type: 'shapeArea',
  label: 'A',
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

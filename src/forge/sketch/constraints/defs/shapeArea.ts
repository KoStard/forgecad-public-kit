import type { ShapeId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { shapeVertices, shapeCentroid, traverseShapeVertices, polygonSignedArea } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    shapeArea: { shape: ShapeId; value: number };
  }
}

registerConstraint<'shapeArea', ConstraintTypeMap['shapeArea']>({
  type: 'shapeArea',
  label: 'AREA',
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
    // Prefer ordered traversal for correct signed area; fall back to unordered
    const ordered = traverseShapeVertices(shape, lines, points);
    const pts = ordered ?? shapeVertices(shape, lines, points);
    if (pts.length < 3) return 0;
    const area = Math.abs(polygonSignedArea(pts));
    const err = Math.abs(area - c.value);
    if (err <= tolerance) return err;
    if (area < 1e-9) return err;
    // Uniform scale from centroid: new_area = area * scale²  →  scale = sqrt(target / area)
    const scale = Math.sqrt(c.value / area);
    const [cx, cy] = shapeCentroid(pts);
    for (const pt of pts) {
      if (!pt.fixed) {
        pt.x = cx + (pt.x - cx) * scale;
        pt.y = cy + (pt.y - cy) * scale;
      }
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

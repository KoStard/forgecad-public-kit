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
  label: 'CC',
  isDimension: false,
  equations: 2,

  displayPosition(c, { shapes, lines, points }) {
    const shapeA = shapes.get(c.a);
    const shapeB = shapes.get(c.b);
    if (!shapeA || !shapeB) return [0, 0];
    const [ax, ay] = shapeCentroid(shapeVertices(shapeA, lines, points));
    const [bx, by] = shapeCentroid(shapeVertices(shapeB, lines, points));
    return [(ax + bx) / 2, (ay + by) / 2];
  },

  solve(c, { shapes, lines, points, tolerance }) {
    const shapeA = shapes.get(c.a);
    const shapeB = shapes.get(c.b);
    if (!shapeA || !shapeB) return 0;
    const ptsA = shapeVertices(shapeA, lines, points);
    const ptsB = shapeVertices(shapeB, lines, points);
    if (ptsA.length === 0 || ptsB.length === 0) return 0;

    const [ax, ay] = shapeCentroid(ptsA);
    const [bx, by] = shapeCentroid(ptsB);

    const errX = Math.abs(ax - bx);
    const errY = Math.abs(ay - by);
    const err = Math.max(errX, errY);
    if (err <= tolerance) return err;

    // Translate each shape toward the midpoint between their centroids.
    const tx = (ax + bx) / 2;
    const ty = (ay + by) / 2;

    for (const pt of ptsA) {
      if (!pt.fixed) { pt.x += tx - ax; pt.y += ty - ay; }
    }
    for (const pt of ptsB) {
      if (!pt.fixed) { pt.x += tx - bx; pt.y += ty - by; }
    }
    return err;
  },

  residual(c, { shapes, lines, points }) {
    const shapeA = shapes.get(c.a);
    const shapeB = shapes.get(c.b);
    if (!shapeA || !shapeB) return [0, 0];
    const [ax, ay] = shapeCentroid(shapeVertices(shapeA, lines, points));
    const [bx, by] = shapeCentroid(shapeVertices(shapeB, lines, points));
    return [ax - bx, ay - by];
  },

  computeDof(c, { refCount, lines, shapes }) {
    for (const shapeId of [c.a, c.b]) {
      const shape = shapes.get(shapeId);
      if (!shape) continue;
      const seen = new Set<string>();
      for (const lineId of shape.lines) {
        const l = lines.find((ln) => ln.id === lineId);
        if (!l) continue;
        for (const ptId of [l.a, l.b]) {
          if (!seen.has(ptId)) { seen.add(ptId); refCount.set(ptId, (refCount.get(ptId) ?? 0) + 1); }
        }
      }
    }
  },
});

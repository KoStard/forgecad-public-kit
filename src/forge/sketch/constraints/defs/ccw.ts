import type { PointId, SketchPoint, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { polygonSignedArea, reflectPointAcrossLine } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Enforces counter-clockwise winding order on a polygon defined by `points`.
     *
     * This resolves the discrete orientation ambiguity that arises when a polygon's
     * shape is fully determined but its mirror image also satisfies all constraints
     * (e.g. an equilateral triangle with a fixed vertex and side angle).
     *
     * Applied during **presolve** and **solve**: if the signed area is negative
     * (clockwise), the last non-fixed vertex is reflected across the line formed
     * by the first two vertices. Contributes **0 equations** — it is a discrete
     * constraint, not a continuous one, so it does not change the DOF count.
     */
    ccw: { points: PointId[] };
  }
}

registerConstraint<'ccw', ConstraintTypeMap['ccw']>({
  type: 'ccw',
  label: 'CCW',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 3) return [0, 0];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [cx, cy] as [number, number];
  },

  presolve(c, { points }) {
    enforceWinding(c.points, points);
  },

  solve(c, { points }) {
    enforceWinding(c.points, points);
    return 0;
  },

  residual() {
    // Discrete constraint — no continuous residual equations.
    return [];
  },

  computeDof() {
    // No continuous DOF consumed.
  },
});

/**
 * If the polygon wound by `ptIds` has negative signed area (clockwise),
 * reflect the last non-fixed vertex across the line formed by the first two
 * vertices to flip it to counter-clockwise.
 */
function enforceWinding(
  ptIds: PointId[],
  points: ReadonlyMap<PointId, SketchPoint>,
): void {
  const pts = ptIds.map((id) => points.get(id)).filter(Boolean) as SketchPoint[];
  if (pts.length < 3) return;
  const area = polygonSignedArea(pts);
  if (area >= 0) return; // already CCW (or degenerate)

  // Find the last non-fixed point and reflect it across the line p0→p1.
  // For the typical triangle case: p0 is fixed, p1's direction is constrained,
  // so p2 (the free vertex) gets reflected.
  const p0 = pts[0];
  const p1 = pts[1];
  for (let i = pts.length - 1; i >= 0; i--) {
    if (!pts[i].fixed) {
      const [rx, ry] = reflectPointAcrossLine(pts[i], p0, p1);
      pts[i].x = rx;
      pts[i].y = ry;
      return;
    }
  }
}

import type { PointId, SketchPoint, ConstraintTypeMap, AnnotationElement } from '../types';
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
     * **Presolve**: reflects a free vertex if the polygon is clockwise, seeding LM
     * in the CCW basin.
     *
     * **Residual**: one-sided barrier — `0` when CCW (area ≥ 0), negative when CW.
     * This gives LM gradient information to avoid mirror solutions without
     * consuming a DOF (`equations: 0` keeps DOF arithmetic unchanged).
     */
    ccw: { points: PointId[] };
  }
}

registerConstraint<'ccw', ConstraintTypeMap['ccw']>({
  type: 'ccw',
  label: '↺',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 3) return [0, 0];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [cx, cy] as [number, number];
  },

  displayAnnotations(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 3) return [];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [{ kind: 'symbol', position: [cx, cy] as [number, number], symbol: 'ccw' as const }];
  },

  presolve(c, { points }) {
    enforceWinding(c.points, points);
  },

  solve(c, { points }) {
    enforceWinding(c.points, points);
    return 0;
  },

  residual(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 3) return [0];
    const area = polygonSignedArea(pts);
    if (area >= 0) return [0]; // CCW — satisfied

    // CW: return a normalized one-sided penalty so LM sees the violation.
    // Normalize by perimeter² to keep the residual scale-independent (~O(1)).
    let perimeter = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      perimeter += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    }
    const scale = (perimeter * perimeter) / (4 * Math.PI) || 1; // isoperimetric reference
    return [area / scale]; // negative value drives LM toward CCW
  },

  computeDof() {
    // No continuous DOF consumed — CCW is a discrete orientation choice.
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

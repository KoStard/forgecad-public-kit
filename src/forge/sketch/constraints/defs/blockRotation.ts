import type { PointId, SketchPoint, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Prevents 180° rotation of a polygon by ensuring the first edge
     * (p0 → p1) maintains its initial direction sign.
     *
     * For an axis-aligned rectangle [bl, br, tr, tl], this guarantees
     * `br.x > bl.x` — i.e. the "bottom" edge points rightward (+x).
     * Without this, a rect can satisfy CCW winding while being inside-out
     * (negative width AND negative height → positive area → CCW blind spot).
     *
     * Uses the same one-sided barrier pattern as `ccw`:
     * - `equations: 0` — no continuous DOF consumed
     * - Presolve/solve: swap endpoints when violated
     * - Residual: one-sided penalty giving LM gradient info
     *
     * The constraint stores `axis: 'x' | 'y'` — which coordinate of the
     * first edge must increase. For rects, this is `'x'` (bottom goes right).
     */
    blockRotation: { points: PointId[]; axis: 'x' | 'y' };
  }
}

registerConstraint<'blockRotation', ConstraintTypeMap['blockRotation']>({
  type: 'blockRotation',
  label: '⊡',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    if (pts.length < 2) return [0, 0];
    return [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
  },

  displayAnnotations() {
    return []; // No visual annotation — structural constraint
  },

  presolve(c, { points }) {
    enforceEdgeDirection(c, points);
  },

  solve(c, { points }) {
    enforceEdgeDirection(c, points);
    return 0;
  },

  residual(c, { points }) {
    const p0 = points.get(c.points[0]);
    const p1 = points.get(c.points[1]);
    if (!p0 || !p1) return [0];

    // First edge must increase along the specified axis.
    const delta = c.axis === 'x' ? (p1.x - p0.x) : (p1.y - p0.y);
    if (delta > 0) return [0]; // Correct direction — satisfied

    // Wrong direction: return one-sided penalty normalized by polygon size.
    const pts = c.points.map((id: PointId) => points.get(id)).filter(Boolean) as SketchPoint[];
    let perimeter = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      perimeter += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    }
    const scale = perimeter || 1;
    return [delta / scale]; // Negative when wrong → drives LM to fix it
  },

  computeDof() {
    // No continuous DOF consumed — discrete orientation choice.
  },
});

/**
 * If the first edge (p0 → p1) points in the wrong direction along the
 * specified axis, swap ALL diagonal pairs to correct the 180° rotation.
 */
function enforceEdgeDirection(
  c: ConstraintTypeMap['blockRotation'],
  points: ReadonlyMap<PointId, SketchPoint>,
): void {
  const pts = c.points.map((id) => points.get(id)).filter(Boolean) as SketchPoint[];
  if (pts.length < 2) return;

  const delta = c.axis === 'x' ? (pts[1].x - pts[0].x) : (pts[1].y - pts[0].y);
  if (delta >= 0) return; // Correct direction

  // Reverse ALL point positions along the offending axis to undo the rotation.
  // For a rect [bl, br, tr, tl], when bl.x > br.x, we need to mirror all
  // x-coordinates around the centroid to flip the direction.
  let cx = 0, cy = 0;
  let freeCount = 0;
  for (const p of pts) {
    if (!p.fixed) { cx += p.x; cy += p.y; freeCount++; }
  }
  if (freeCount === 0) return;
  cx /= freeCount;
  cy /= freeCount;

  for (const p of pts) {
    if (p.fixed) continue;
    if (c.axis === 'x') {
      p.x = 2 * cx - p.x;
    } else {
      p.y = 2 * cy - p.y;
    }
  }
}

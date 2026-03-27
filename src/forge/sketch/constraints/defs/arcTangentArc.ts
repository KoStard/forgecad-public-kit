/**
 * Thin TS constraint descriptor for `arcTangentArc`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { ArcId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains two arcs to be tangent (G1 smooth) at a shared junction point.
     *
     * The radius vectors of both arcs at the junction must be collinear
     * (cross product of unit radii = 0), ensuring the tangent directions match.
     *
     * Use `coincident` separately to enforce the shared endpoint.
     * Contributes **1 equation**.
     */
    arcTangentArc: {
      arcA: ArcId;
      arcB: ArcId;
      /** Use arc A's start (true) or end (false) as the junction. */
      aAtStart: boolean;
      /** Use arc B's start (true) or end (false) as the junction. */
      bAtStart: boolean;
    };
  }
}

registerConstraint<'arcTangentArc', ConstraintTypeMap['arcTangentArc']>({
  type: 'arcTangentArc',
  label: '⊤⊤',
  isDimension: false,
  equations: 1,

  displayPosition(c, { arcs, points }) {
    const arcA = arcs.get(c.arcA);
    if (!arcA) return [0, 0];
    const pt = points.get(c.aAtStart ? arcA.start : arcA.end);
    if (!pt) return [0, 0];
    return [pt.x + 2.5, pt.y + 2.5];
  },

  displayAnnotations(c, { arcs, points }) {
    const arcA = arcs.get(c.arcA);
    if (!arcA) return [];
    const pt = points.get(c.aAtStart ? arcA.start : arcA.end);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'tangent' as const }];
  },
});

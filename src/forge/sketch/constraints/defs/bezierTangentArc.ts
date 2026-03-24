/**
 * Thin TS constraint descriptor for `bezierTangentArc`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, ArcId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains a cubic Bezier curve to be tangent to an arc at one of their endpoints.
     *
     * The Bezier's tangent direction (tangent_control − tangent_base) must be
     * perpendicular to the arc's radius at the contact point.
     *
     * The builder resolves the Bezier entity to two point IDs:
     *   - at bezier start: tangentBase=P0, tangentControl=P1
     *   - at bezier end:   tangentBase=P3, tangentControl=P2
     *
     * Contributes **1 equation**.
     */
    bezierTangentArc: {
      /** Point on the Bezier at the tangent end (P0 for start, P3 for end). */
      tangentBase: PointId;
      /** Control point defining tangent direction (P1 for start, P2 for end). */
      tangentControl: PointId;
      arc: ArcId;
      /** Use arc start (true) or end (false) as the contact point. */
      atArcStart: boolean;
    };
  }
}

registerConstraint<'bezierTangentArc', ConstraintTypeMap['bezierTangentArc']>({
  type: 'bezierTangentArc',
  label: '⊤B',
  isDimension: false,
  equations: 1,

  displayPosition(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return [0, 0];
    const pt = points.get(c.atArcStart ? arc.start : arc.end);
    if (!pt) return [0, 0];
    return [pt.x + 2.5, pt.y + 2.5];
  },

  displayAnnotations(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return [];
    const pt = points.get(c.atArcStart ? arc.start : arc.end);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'tangent' as const }];
  },
});

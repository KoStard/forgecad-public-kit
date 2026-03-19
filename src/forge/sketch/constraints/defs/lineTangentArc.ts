import type { ArcId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains a line to be tangent to an arc at the arc's start or end point.
     *
     * Tangency requires the line's direction to be perpendicular to the arc's
     * radius at the contact point. Set `atStart: true` to use the arc's start
     * point as the tangency contact; `false` uses the end point.
     *
     * The solver rotates the line (around its midpoint, or from the fixed end)
     * so that `dot(unit_line, unit_radius) = 0`.
     * Contributes **1 equation**.
     */
    lineTangentArc: { line: LineId; arc: ArcId; atStart: boolean };
  }
}

registerConstraint<'lineTangentArc', ConstraintTypeMap['lineTangentArc']>({
  type: 'lineTangentArc',
  label: '⊤',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, arcs, points }) {
    const line = lines.get(c.line);
    const arc = arcs.get(c.arc);
    if (!line || !arc) return [0, 0];
    const pt = points.get(c.atStart ? arc.start : arc.end);
    if (!pt) return [0, 0];
    return [pt.x + 2.5, pt.y + 2.5];
  },

  displayAnnotations(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return [];
    const pt = points.get(c.atStart ? arc.start : arc.end);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'tangent' as const }];
  },});

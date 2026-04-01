/**
 * Thin TS constraint descriptor for `midpoint`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to sit at the exact midpoint of a line segment.
     *
     * Rust enforces this as two scalar equations, one per axis:
     * `point - (a + b) / 2 = [0, 0]`.
     */
    midpoint: { point: PointId; line: LineId };
  }
}

registerConstraint<'midpoint', ConstraintTypeMap['midpoint']>({
  type: 'midpoint',
  label: '◆',
  isDimension: false,
  equations: 2,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (line) {
      const a = points.get(line.a);
      const b = points.get(line.b);
      if (a && b) return midpointPerp(a, b, 3);
    }
    return [0, 0];
  },

  displayAnnotations(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [];
    const a = points.get(line.a),
      b = points.get(line.b);
    if (!a || !b) return [];
    return [{ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'midpoint' as const }];
  },
});

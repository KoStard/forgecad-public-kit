/**
 * Thin TS constraint descriptor for `vertical`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a line to be vertical (parallel to the Y axis).
     *
     * Both endpoints are moved to their average X coordinate so the line
     * remains centered in place. Contributes **1 equation**: `b.x − a.x = 0`.
     */
    vertical: { line: LineId };
  }
}

registerConstraint<'vertical', ConstraintTypeMap['vertical']>({
  type: 'vertical',
  label: 'V',
  isDimension: false,
  equations: 1,

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
    return [{ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'vertical' as const }];
  },
});

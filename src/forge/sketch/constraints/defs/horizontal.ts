/**
 * Thin TS constraint descriptor for `horizontal`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a line to be horizontal (parallel to the X axis).
     *
     * Both endpoints are moved to their average Y coordinate so the line
     * remains centered in place. Contributes **1 equation**: `b.y − a.y = 0`.
     */
    horizontal: { line: LineId };
  }
}

registerConstraint<'horizontal', ConstraintTypeMap['horizontal']>({
  type: 'horizontal',
  label: 'H',
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
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [];
    return [{ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'horizontal' as const }];
  },
});

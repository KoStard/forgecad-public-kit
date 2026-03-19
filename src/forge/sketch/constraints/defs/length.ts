/**
 * Thin TS constraint descriptor for `length`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, distance, lineDirection } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the length of a line segment to `value`.
     *
     * Endpoints are scaled symmetrically about the line's midpoint while
     * preserving its direction. Contributes **1 equation**:
     * `|b − a| − value = 0`.
     */
    length: { line: LineId; value: number };
  }
}

registerConstraint<'length', ConstraintTypeMap['length']>({
  type: 'length',
  label: '⟨',
  isDimension: true,
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

  displayAnnotations(c, { lines, points }): AnnotationElement[] {
    const line = lines.get(c.line);
    if (!line) return [];
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [];
    return [{ kind: 'dimension', from: [a.x, a.y], to: [b.x, b.y], offset: 3, value: String(c.value) }];
  },
});

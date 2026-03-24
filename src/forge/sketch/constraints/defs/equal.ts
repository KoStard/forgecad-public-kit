/**
 * Thin TS constraint descriptor for `equal`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces lines `a` and `b` to have the same length.
     *
     * Line `a`'s length is used as the target; `b`'s endpoints are scaled
     * symmetrically along `b`'s current direction to match it.
     * Contributes **1 equation**: `|b| − |a| = 0`.
     */
    equal: { a: LineId; b: LineId };
  }
}

registerConstraint<'equal', ConstraintTypeMap['equal']>({
  type: 'equal',
  label: '=',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const lineA = lines.get(c.a);
    if (lineA) {
      const a1 = points.get(lineA.a);
      const a2 = points.get(lineA.b);
      if (a1 && a2) return midpointPerp(a1, a2, 3);
    }
    return [0, 0];
  },

  displayAnnotations(c, { lines, points }) {
    const annotations: AnnotationElement[] = [];
    for (const lineId of [c.a, c.b]) {
      const line = lines.get(lineId);
      if (!line) continue;
      const a = points.get(line.a);
      const b = points.get(line.b);
      if (!a || !b) continue;
      const rotation = Math.atan2(b.y - a.y, b.x - a.x);
      annotations.push({ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'equal', rotation });
    }
    return annotations;
  },
});

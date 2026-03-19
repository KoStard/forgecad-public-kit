/**
 * Thin TS constraint descriptor for `parallel`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, angleOfLine, normalizeAngle, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces lines `a` and `b` to be parallel.
     *
     * The direction of `b` is rotated to match `a`'s direction (either
     * co-directional or anti-parallel — whichever is closer to the current
     * orientation). Line `a` is treated as the reference; only `b` is moved.
     * Contributes **1 equation**: `cross(unit_a, unit_b) = 0`.
     */
    parallel: { a: LineId; b: LineId };
  }
}

registerConstraint<'parallel', ConstraintTypeMap['parallel']>({
  type: 'parallel',
  label: '∥',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const lineA = lines.get(c.a);
    if (lineA) {
      const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
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
      annotations.push({ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'parallel', rotation });
    }
    return annotations;
  },
});

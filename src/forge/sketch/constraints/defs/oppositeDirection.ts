/**
 * Thin TS constraint descriptor for `oppositeDirection`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces lines `a` and `b` to point in **opposite directions** (anti-parallel).
     *
     * Unlike `parallel` (which allows either co-directional or anti-parallel),
     * this constraint pins the relative direction: `dot(unit_a, unit_b) < 0`
     * AND `cross(unit_a, unit_b) = 0`.
     *
     * Use this with `lineDistance` when you need two lines facing each other —
     * e.g. the top of one rect facing the bottom of another.
     *
     * Rust uses one continuous parallelism equation plus orientation-aware
     * branch handling to keep `b` facing opposite to `a`.
     */
    oppositeDirection: { a: LineId; b: LineId };
  }
}

registerConstraint<'oppositeDirection', ConstraintTypeMap['oppositeDirection']>({
  type: 'oppositeDirection',
  label: '⇄',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.a);
    if (!line) return [0, 0];
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [0, 0];
    return [(a.x + b.x) / 2, (a.y + b.y) / 2];
  },

  displayAnnotations(c, { lines, points }): AnnotationElement[] {
    const annotations: AnnotationElement[] = [];
    for (const lineId of [c.a, c.b]) {
      const line = lines.get(lineId);
      if (!line) continue;
      const a = points.get(line.a), b = points.get(line.b);
      if (!a || !b) continue;
      const rotation = Math.atan2(b.y - a.y, b.x - a.x);
      annotations.push({
        kind: 'symbol',
        position: [(a.x + b.x) / 2, (a.y + b.y) / 2],
        symbol: 'parallel',
        rotation,
      });
    }
    return annotations;
  },
});

import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, angleOfLine, normalizeAngle, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces lines `a` and `b` to be parallel **and** separated by a signed
     * perpendicular distance of `value`.
     *
     * The distance is measured from the midpoint of `a` to the midpoint of `b`
     * along `a`'s left-normal direction. Positive values place `b` to the left
     * of `a` (when facing `a`'s direction).
     *
     * This constraint combines two equations:
     * 1. `cross(unit_a, unit_b) = 0` — parallelism
     * 2. `perpDist(mid_b, line_a) − value = 0` — offset distance
     *
     * Contributes **2 equations**.
     */
    lineDistance: { a: LineId; b: LineId; value: number };
  }
}

/** Exported for backward-compatibility with forge-public-api.ts */
export type LineDistanceConstraint = { id: string; type: 'lineDistance' } & { a: LineId; b: LineId; value: number };

registerConstraint<'lineDistance', ConstraintTypeMap['lineDistance']>({
  type: 'lineDistance',
  label: '↕',
  isDimension: true,
  equations: 2,

  displayPosition(c, { lines, points }) {
    const lineA = lines.get(c.a);
    if (lineA) {
      const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
      if (a1 && a2) return midpointPerp(a1, a2, 3);
    }
    return [0, 0];
  },

  displayAnnotations(c, { lines, points }): AnnotationElement[] {
    const lineA = lines.get(c.a), lineB = lines.get(c.b);
    if (!lineA || !lineB) return [];
    const a1 = points.get(lineA.a), a2 = points.get(lineA.b);
    const b1 = points.get(lineB.a), b2 = points.get(lineB.b);
    if (!a1 || !a2 || !b1 || !b2) return [];
    const midA: [number, number] = [(a1.x + a2.x) / 2, (a1.y + a2.y) / 2];
    const midB: [number, number] = [(b1.x + b2.x) / 2, (b1.y + b2.y) / 2];
    return [{ kind: 'dimension', from: midA, to: midB, offset: 0, value: String(c.value) }];
  },});

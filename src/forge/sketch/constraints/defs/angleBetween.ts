import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpointPerp, angleOfLine, normalizeAngle, distance, toRad } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the unsigned angle between lines `a` and `b` to `value` degrees.
     *
     * Unlike `angle` (which is directional — 90 ≠ −90), this constraint
     * accepts both orientations of `b`: whichever of `+value` or `+value+180°`
     * is closer to the current direction is chosen. Use this when you care
     * about the magnitude of the angle but not the sign (e.g. "these two lines
     * are 60° apart" without specifying which side).
     *
     * Contributes **1 equation**: `sin(angleB − angleA − target) = 0`.
     */
    angleBetween: { a: LineId; b: LineId; value: number };
  }
}

/** Count how many lines reference a given point ID. */
const pointLineRefs = (
  ptId: string,
  lines: ReadonlyMap<string, { a: string; b: string }>,
): number => {
  let n = 0;
  for (const l of lines.values()) {
    if (l.a === ptId || l.b === ptId) n++;
  }
  return n;
};

registerConstraint<'angleBetween', ConstraintTypeMap['angleBetween']>({
  type: 'angleBetween',
  label: '∠∠',
  isDimension: true,
  equations: 1,

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
    const shared = [lineA.a, lineA.b].find(p => p === lineB.a || p === lineB.b);
    let center: [number, number];
    if (shared) {
      const pt = points.get(shared)!;
      center = [pt.x, pt.y];
    } else {
      center = [(a1.x + a2.x + b1.x + b2.x) / 4, (a1.y + a2.y + b1.y + b2.y) / 4];
    }
    const angleA = Math.atan2(a2.y - a1.y, a2.x - a1.x);
    const angleB = Math.atan2(b2.y - b1.y, b2.x - b1.x);
    const lenA = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    const lenB = Math.hypot(b2.x - b1.x, b2.y - b1.y);
    const arcRadius = Math.max(1.5, Math.min(4, Math.min(lenA, lenB) * 0.3));
    return [{ kind: 'angle-arc', center, startAngle: angleA, endAngle: angleB, radius: arcRadius, value: `${c.value}°` }];
  },

  computeDof(c, { refCount, lines }) {
    const lineA = lines.find((l) => l.id === c.a);
    const lineB = lines.find((l) => l.id === c.b);
    if (lineA) {
      refCount.set(lineA.a, (refCount.get(lineA.a) ?? 0) + 1);
      refCount.set(lineA.b, (refCount.get(lineA.b) ?? 0) + 1);
    }
    if (lineB) {
      refCount.set(lineB.a, (refCount.get(lineB.a) ?? 0) + 1);
      refCount.set(lineB.b, (refCount.get(lineB.b) ?? 0) + 1);
    }
  },
});

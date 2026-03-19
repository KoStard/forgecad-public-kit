import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, angleOfLine, normalizeAngle, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces lines `a` and `b` to be perpendicular (90° apart).
     *
     * The direction of `b` is rotated to be ±90° from `a`, choosing the
     * sign closest to the current orientation. Line `a` is the reference;
     * only `b` is moved. Contributes **1 equation**: `dot(unit_a, unit_b) = 0`.
     */
    perpendicular: { a: LineId; b: LineId };
  }
}

registerConstraint<'perpendicular', ConstraintTypeMap['perpendicular']>({
  type: 'perpendicular',
  label: '⊥',
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
    const lineA = lines.get(c.a);
    const lineB = lines.get(c.b);
    if (!lineA || !lineB) return [];
    // Find shared endpoint
    const shared = [lineA.a, lineA.b].find(p => p === lineB.a || p === lineB.b);
    if (shared) {
      const pt = points.get(shared);
      if (pt) {
        const aOther = points.get(lineA.a === shared ? lineA.b : lineA.a);
        const rotation = aOther ? Math.atan2(aOther.y - pt.y, aOther.x - pt.x) : 0;
        return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'perpendicular' as const, rotation }];
      }
    }
    // Fallback: midpoint of line A
    const a1 = points.get(lineA.a), a2 = points.get(lineA.b);
    if (a1 && a2) return [{ kind: 'symbol', position: midpointPerp(a1, a2, 3), symbol: 'perpendicular' as const }];
    return [];
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

import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, distance, lineDirection } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    equal: { a: LineId; b: LineId };
  }
}

registerConstraint<'equal', ConstraintTypeMap['equal']>({
  type: 'equal',
  label: 'EQ',
  isDimension: false,

  displayPosition(c, { lines, points }) {
    const lineA = lines.get(c.a);
    const lineB = lines.get(c.b);
    if (lineA && lineB) {
      const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
      const b1 = points.get(lineB.a); const b2 = points.get(lineB.b);
      if (a1 && a2 && b1 && b2) {
        const midA = midpoint(a1, a2);
        const midB = midpoint(b1, b2);
        return [(midA[0] + midB[0]) / 2, (midA[1] + midB[1]) / 2];
      }
    }
    return [0, 0];
  },

  solve(c, { lines, points, tolerance }) {
    const lineA = lines.get(c.a);
    const lineB = lines.get(c.b);
    if (!lineA || !lineB) return 0;
    const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
    const b1 = points.get(lineB.a); const b2 = points.get(lineB.b);
    if (!a1 || !a2 || !b1 || !b2) return 0;
    const lenA = distance(a1, a2);
    const lenB = distance(b1, b2) || 1;
    const err = Math.abs(lenB - lenA);
    if (err <= tolerance) return err;
    if (b1.fixed && b2.fixed) return err;
    const dir = lineDirection(b1, b2);
    if (b1.fixed) {
      b2.x = b1.x + dir[0] * lenA; b2.y = b1.y + dir[1] * lenA;
    } else if (b2.fixed) {
      b1.x = b2.x - dir[0] * lenA; b1.y = b2.y - dir[1] * lenA;
    } else {
      const mid = midpoint(b1, b2);
      b1.x = mid[0] - dir[0] * lenA / 2; b1.y = mid[1] - dir[1] * lenA / 2;
      b2.x = mid[0] + dir[0] * lenA / 2; b2.y = mid[1] + dir[1] * lenA / 2;
    }
    return err;
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

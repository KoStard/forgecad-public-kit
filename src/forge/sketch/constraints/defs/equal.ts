import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, distance, lineDirection } from '../helpers';

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
      annotations.push({ kind: 'symbol', position: [(a.x+b.x)/2, (a.y+b.y)/2], symbol: 'equal', rotation });
    }
    return annotations;
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


  residual(c, { lines, points }) {
    const la = lines.get(c.a); const lb = lines.get(c.b);
    if (!la || !lb) return [0];
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return [0];
    return [Math.hypot(a2.x - a1.x, a2.y - a1.y) - Math.hypot(b2.x - b1.x, b2.y - b1.y)];
  },

  jacobian(c, { lines, points }) {
    const la = lines.get(c.a); const lb = lines.get(c.b);
    if (!la || !lb) return { residuals: [0], partials: {} };
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return { residuals: [0], partials: {} };
    const dax = a2.x - a1.x, day = a2.y - a1.y;
    const dbx = b2.x - b1.x, dby = b2.y - b1.y;
    const lenA = Math.hypot(dax, day) || 1e-12;
    const lenB = Math.hypot(dbx, dby) || 1e-12;
    const uax = dax / lenA, uay = day / lenA;
    const ubx = dbx / lenB, uby = dby / lenB;
    return {
      residuals: [lenA - lenB],
      partials: {
        [`${la.a}.x`]: [-uax],
        [`${la.a}.y`]: [-uay],
        [`${la.b}.x`]: [uax],
        [`${la.b}.y`]: [uay],
        [`${lb.a}.x`]: [ubx],
        [`${lb.a}.y`]: [uby],
        [`${lb.b}.x`]: [-ubx],
        [`${lb.b}.y`]: [-uby],
      },
    };
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

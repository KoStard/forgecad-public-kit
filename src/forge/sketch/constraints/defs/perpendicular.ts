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

  solve(c, { lines, points, tolerance }) {
    const lineA = lines.get(c.a);
    const lineB = lines.get(c.b);
    if (!lineA || !lineB) return 0;
    const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
    const b1 = points.get(lineB.a); const b2 = points.get(lineB.b);
    if (!a1 || !a2 || !b1 || !b2) return 0;
    const baseAngle = angleOfLine(a1, a2);
    const current = angleOfLine(b1, b2);
    const d90 = Math.abs(normalizeAngle(current - (baseAngle + Math.PI / 2)));
    const dN90 = Math.abs(normalizeAngle(current - (baseAngle - Math.PI / 2)));
    const target = d90 <= dN90 ? baseAngle + Math.PI / 2 : baseAngle - Math.PI / 2;
    const err = Math.abs(normalizeAngle(current - target));
    if (err <= tolerance) return err;
    if (b1.fixed && b2.fixed) return err;
    const len = distance(b1, b2) || 1;
    const dir: [number, number] = [Math.cos(target), Math.sin(target)];
    if (b1.fixed) {
      b2.x = b1.x + dir[0] * len; b2.y = b1.y + dir[1] * len;
    } else if (b2.fixed) {
      b1.x = b2.x - dir[0] * len; b1.y = b2.y - dir[1] * len;
    } else {
      const mid = midpoint(b1, b2);
      b1.x = mid[0] - dir[0] * len / 2; b1.y = mid[1] - dir[1] * len / 2;
      b2.x = mid[0] + dir[0] * len / 2; b2.y = mid[1] + dir[1] * len / 2;
    }
    return err;
  },


  residual(c, { lines, points }) {
    const la = lines.get(c.a); const lb = lines.get(c.b);
    if (!la || !lb) return [0];
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return [0];
    const dax = a2.x - a1.x; const day = a2.y - a1.y;
    const dbx = b2.x - b1.x; const dby = b2.y - b1.y;
    const lenA = Math.hypot(dax, day) || 1;
    const lenB = Math.hypot(dbx, dby) || 1;
    // Dot product of unit direction vectors = 0 for perpendicular
    return [(dax / lenA) * (dbx / lenB) + (day / lenA) * (dby / lenB)];
  },

  jacobian(c, { lines, points }) {
    const la = lines.get(c.a); const lb = lines.get(c.b);
    if (!la || !lb) return { residuals: [0], partials: {} };
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return { residuals: [0], partials: {} };
    const dax = a2.x - a1.x, day = a2.y - a1.y;
    const dbx = b2.x - b1.x, dby = b2.y - b1.y;
    const la2 = dax * dax + day * day || 1e-24;
    const lb2 = dbx * dbx + dby * dby || 1e-24;
    const lenA = Math.sqrt(la2), lenB = Math.sqrt(lb2);
    const uax = dax / lenA, uay = day / lenA;
    const ubx = dbx / lenB, uby = dby / lenB;
    const cross = uax * uby - uay * ubx;
    const dot = uax * ubx + uay * uby;
    return {
      residuals: [dot],
      partials: {
        [`${la.a}.x`]: [day * cross / la2],
        [`${la.a}.y`]: [-dax * cross / la2],
        [`${la.b}.x`]: [-day * cross / la2],
        [`${la.b}.y`]: [dax * cross / la2],
        [`${lb.a}.x`]: [-dby * cross / lb2],
        [`${lb.a}.y`]: [dbx * cross / lb2],
        [`${lb.b}.x`]: [dby * cross / lb2],
        [`${lb.b}.y`]: [-dbx * cross / lb2],
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

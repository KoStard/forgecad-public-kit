import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, angleOfLine, normalizeAngle, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    parallel: { a: LineId; b: LineId };
  }
}

registerConstraint<'parallel', ConstraintTypeMap['parallel']>({
  type: 'parallel',
  label: 'PAR',
  isDimension: false,
  equations: 1,

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
    const baseAngle = angleOfLine(a1, a2);
    const current = angleOfLine(b1, b2);
    const d0 = Math.abs(normalizeAngle(current - baseAngle));
    const dPI = Math.abs(normalizeAngle(current - (baseAngle + Math.PI)));
    const target = d0 <= dPI ? baseAngle : baseAngle + Math.PI;
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
    // Cross product of unit direction vectors
    return [(dax / lenA) * (dby / lenB) - (day / lenA) * (dbx / lenB)];
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

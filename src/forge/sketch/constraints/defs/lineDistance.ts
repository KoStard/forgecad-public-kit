import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, angleOfLine, normalizeAngle, distance } from '../helpers';

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
  label: 'LDIST',
  isDimension: true,
  equations: 2,

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

    // Step 1: enforce parallelism (rotate B to match A's angle)
    const angleA = angleOfLine(a1, a2);
    const angleB = angleOfLine(b1, b2);
    const diff = angleA - angleB;
    const diffFlipped = angleA + Math.PI - angleB;
    const useFlipped = Math.abs(normalizeAngle(diffFlipped)) < Math.abs(normalizeAngle(diff));
    const targetAngle = useFlipped ? angleA + Math.PI : angleA;
    const angleDelta = normalizeAngle(targetAngle - angleB);
    if (Math.abs(angleDelta) > tolerance * 0.01) {
      const midBx = (b1.x + b2.x) / 2;
      const midBy = (b1.y + b2.y) / 2;
      const lenB = distance(b1, b2) || 1;
      const cos = Math.cos(targetAngle);
      const sin = Math.sin(targetAngle);
      if (!b1.fixed) { b1.x = midBx - cos * lenB / 2; b1.y = midBy - sin * lenB / 2; }
      if (!b2.fixed) { b2.x = midBx + cos * lenB / 2; b2.y = midBy + sin * lenB / 2; }
    }

    // Step 2: compute signed perpendicular distance from A to midpoint of B
    const dxA = a2.x - a1.x;
    const dyA = a2.y - a1.y;
    const lenA = Math.sqrt(dxA * dxA + dyA * dyA) || 1;
    const nx = -dyA / lenA;
    const ny = dxA / lenA;
    const midBx2 = (b1.x + b2.x) / 2;
    const midBy2 = (b1.y + b2.y) / 2;
    const midAx = (a1.x + a2.x) / 2;
    const midAy = (a1.y + a2.y) / 2;
    const currentDist = (midBx2 - midAx) * nx + (midBy2 - midAy) * ny;
    const err = Math.abs(currentDist - c.value);
    if (err <= tolerance) return err;

    // Shift line B along the normal so the distance matches the target
    const shift = c.value - currentDist;
    const allBFixed = b1.fixed && b2.fixed;
    const allAFixed = a1.fixed && a2.fixed;
    if (allBFixed && allAFixed) return err;
    if (allAFixed || !allBFixed) {
      if (!b1.fixed) { b1.x += nx * shift; b1.y += ny * shift; }
      if (!b2.fixed) { b2.x += nx * shift; b2.y += ny * shift; }
    } else {
      if (!a1.fixed) { a1.x -= nx * shift; a1.y -= ny * shift; }
      if (!a2.fixed) { a2.x -= nx * shift; a2.y -= ny * shift; }
    }
    return err;
  },


  residual(c, { lines, points }) {
    const la = lines.get(c.a); const lb = lines.get(c.b);
    if (!la || !lb) return [0, 0];
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return [0, 0];
    const dax = a2.x - a1.x; const day = a2.y - a1.y;
    const dbx = b2.x - b1.x; const dby = b2.y - b1.y;
    const lenA = Math.hypot(dax, day) || 1;
    const lenB = Math.hypot(dbx, dby) || 1;
    // 1) Parallel: cross of unit directions = 0
    const parallel = (dax / lenA) * (dby / lenB) - (day / lenA) * (dbx / lenB);
    // 2) Signed perpendicular distance from midpoint of b to line a = value
    const nx = -day / lenA; const ny = dax / lenA;
    const midBx = (b1.x + b2.x) / 2; const midBy = (b1.y + b2.y) / 2;
    const midAx = (a1.x + a2.x) / 2; const midAy = (a1.y + a2.y) / 2;
    const dist = (midBx - midAx) * nx + (midBy - midAy) * ny;
    return [parallel, dist - c.value];
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

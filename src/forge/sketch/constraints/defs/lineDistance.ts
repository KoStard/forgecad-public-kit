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
  },

  presolve(c, { lines, points, entityRefCount }) {
    const lineA = lines.get(c.a);
    const lineB = lines.get(c.b);
    if (!lineA || !lineB) return;
    const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
    const b1 = points.get(lineB.a); const b2 = points.get(lineB.b);
    if (!a1 || !a2 || !b1 || !b2) return;

    const lenA = distance(a1, a2) || 1;
    const lenB = distance(b1, b2) || 1;

    // Compute current signed perpendicular distance (midB to line A).
    const dxA = a2.x - a1.x; const dyA = a2.y - a1.y;
    const nx = -dyA / lenA; const ny = dxA / lenA;
    const midBx = (b1.x + b2.x) / 2; const midBy = (b1.y + b2.y) / 2;
    const midAx = (a1.x + a2.x) / 2; const midAy = (a1.y + a2.y) / 2;
    const currentDist = (midBx - midAx) * nx + (midBy - midAy) * ny;
    const shift = c.value - currentDist;
    if (Math.abs(shift) < 0.01) return;

    // Move the LESS CONSTRAINED line toward the more constrained one.
    // Primary: constraint reference count (lines with more constraints are established).
    // Fallback: line length (shorter = newer, e.g. default 10×10 rect).
    const allAFixed = a1.fixed && a2.fixed;
    const allBFixed = b1.fixed && b2.fixed;
    if (allAFixed && allBFixed) return;

    let moveA: boolean;
    if (allAFixed) {
      moveA = false;
    } else if (allBFixed) {
      moveA = true;
    } else if (entityRefCount) {
      const refsA = (entityRefCount.get(c.a) ?? 0)
        + (entityRefCount.get(lineA.a) ?? 0) + (entityRefCount.get(lineA.b) ?? 0);
      const refsB = (entityRefCount.get(c.b) ?? 0)
        + (entityRefCount.get(lineB.a) ?? 0) + (entityRefCount.get(lineB.b) ?? 0);
      if (refsA < refsB) {
        moveA = true;
      } else if (refsA > refsB) {
        moveA = false;
      } else {
        // Refs are equal — move the shorter line (likely newer geometry),
        // but also move A if it is much longer than B (indicating inflation
        // from prior presolves, e.g. wrapper lines stretched by top/bottom).
        moveA = lenA < lenB || lenA > lenB * 2;
      }
    } else {
      moveA = lenA < lenB;
    }

    if (moveA) {
      if (!a1.fixed) { a1.x -= nx * shift; a1.y -= ny * shift; }
      if (!a2.fixed) { a2.x -= nx * shift; a2.y -= ny * shift; }
    } else {
      if (!b1.fixed) { b1.x += nx * shift; b1.y += ny * shift; }
      if (!b2.fixed) { b2.x += nx * shift; b2.y += ny * shift; }
    }
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

    // Shift lines along the normal so the distance matches the target.
    // When both lines are free and one is much shorter, move the shorter one —
    // it is likely newer geometry that should adapt to established geometry.
    const shift = c.value - currentDist;
    const allBFixed = b1.fixed && b2.fixed;
    const allAFixed = a1.fixed && a2.fixed;
    if (allBFixed && allAFixed) return err;
    let moveA = false;
    if (allAFixed) {
      moveA = false;
    } else if (allBFixed) {
      moveA = true;
    } else {
      const lenASq = (a2.x - a1.x) ** 2 + (a2.y - a1.y) ** 2;
      const lenBSq = (b2.x - b1.x) ** 2 + (b2.y - b1.y) ** 2;
      moveA = lenASq < lenBSq * 0.25;
    }
    if (moveA) {
      if (!a1.fixed) { a1.x -= nx * shift; a1.y -= ny * shift; }
      if (!a2.fixed) { a2.x -= nx * shift; a2.y -= ny * shift; }
    } else {
      if (!b1.fixed) { b1.x += nx * shift; b1.y += ny * shift; }
      if (!b2.fixed) { b2.x += nx * shift; b2.y += ny * shift; }
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

  jacobian(c, { lines, points }) {
    const la = lines.get(c.a); const lb = lines.get(c.b);
    if (!la || !lb) return { residuals: [0, 0], partials: {} };
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return { residuals: [0, 0], partials: {} };
    const dax = a2.x - a1.x, day = a2.y - a1.y;
    const dbx = b2.x - b1.x, dby = b2.y - b1.y;
    const la2 = dax * dax + day * day || 1e-24;
    const lb2 = dbx * dbx + dby * dby || 1e-24;
    const lenA = Math.sqrt(la2), lenB = Math.sqrt(lb2);
    const uax = dax / lenA, uay = day / lenA;
    const ubx = dbx / lenB, uby = dby / lenB;
    const cross = uax * uby - uay * ubx;
    const dot = uax * ubx + uay * uby;
    // r[0] = cross (parallel residual)
    const nx = -day / lenA, ny = dax / lenA;
    const Mx = (b1.x + b2.x) / 2 - (a1.x + a2.x) / 2;
    const My = (b1.y + b2.y) / 2 - (a1.y + a2.y) / 2;
    const dist = Mx * nx + My * ny;
    // r[1] = dist - value
    const DMA = Mx * dax + My * day;
    const lenA3 = la2 * lenA;
    return {
      residuals: [cross, dist - c.value],
      partials: {
        [`${la.a}.x`]: [-day * dot / la2, -nx / 2 - day * DMA / lenA3],
        [`${la.a}.y`]: [dax * dot / la2, -ny / 2 + dax * DMA / lenA3],
        [`${la.b}.x`]: [day * dot / la2, -nx / 2 + day * DMA / lenA3],
        [`${la.b}.y`]: [-dax * dot / la2, -ny / 2 - dax * DMA / lenA3],
        [`${lb.a}.x`]: [dby * dot / lb2, nx / 2],
        [`${lb.a}.y`]: [-dbx * dot / lb2, ny / 2],
        [`${lb.b}.x`]: [-dby * dot / lb2, nx / 2],
        [`${lb.b}.y`]: [dbx * dot / lb2, ny / 2],
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

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

  presolve(c, { lines, points }) {
    const la = lines.get(c.a);
    const lb = lines.get(c.b);
    if (!la || !lb) return;
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return;
    if (b1.fixed && b2.fixed) return;

    const baseAngle = angleOfLine(a1, a2);
    const fwd = baseAngle + toRad(c.value);
    const rev = fwd + Math.PI;
    const current = angleOfLine(b1, b2);
    const target = Math.abs(normalizeAngle(current - fwd)) <= Math.abs(normalizeAngle(current - rev)) ? fwd : rev;

    const len = distance(b1, b2) || 1;
    const cos = Math.cos(target);
    const sin = Math.sin(target);

    const b1Refs = pointLineRefs(lb.a, lines);
    const b2Refs = pointLineRefs(lb.b, lines);

    if (b2.fixed || (!b1.fixed && b2Refs > b1Refs)) {
      b1.x = b2.x - cos * len;
      b1.y = b2.y - sin * len;
    } else {
      b2.x = b1.x + cos * len;
      b2.y = b1.y + sin * len;
    }
  },

  solve(c, { lines, points, tolerance }) {
    const lineA = lines.get(c.a);
    const lineB = lines.get(c.b);
    if (!lineA || !lineB) return 0;
    const a1 = points.get(lineA.a); const a2 = points.get(lineA.b);
    const b1 = points.get(lineB.a); const b2 = points.get(lineB.b);
    if (!a1 || !a2 || !b1 || !b2) return 0;

    const baseAngle = angleOfLine(a1, a2);
    const fwd = baseAngle + toRad(c.value);
    const rev = fwd + Math.PI;
    const current = angleOfLine(b1, b2);
    const target = Math.abs(normalizeAngle(current - fwd)) <= Math.abs(normalizeAngle(current - rev)) ? fwd : rev;
    const err = Math.abs(normalizeAngle(current - target));
    if (err <= tolerance) return err;
    if (b1.fixed && b2.fixed) return err;

    const len = distance(b1, b2) || 1;
    const cos = Math.cos(target);
    const sin = Math.sin(target);

    const b1Refs = pointLineRefs(lineB.a, lines);
    const b2Refs = pointLineRefs(lineB.b, lines);

    if (b2.fixed || (!b1.fixed && b2Refs > b1Refs)) {
      b1.x = b2.x - cos * len;
      b1.y = b2.y - sin * len;
    } else {
      b2.x = b1.x + cos * len;
      b2.y = b1.y + sin * len;
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
    const targetRad = toRad(c.value);
    // sin(angleB - angleA - target) = 0 — satisfied by both target and target+π
    const crossUnit = (dax / lenA) * (dby / lenB) - (day / lenA) * (dbx / lenB);
    const dotUnit = (dax / lenA) * (dbx / lenB) + (day / lenA) * (dby / lenB);
    return [crossUnit * Math.cos(targetRad) - dotUnit * Math.sin(targetRad)];
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
    const targetRad = toRad(c.value);
    const ct = Math.cos(targetRad), st = Math.sin(targetRad);
    const r = cross * ct - dot * st;
    // K = dot*ct + cross*st — common factor for ∂r/∂(angle-affecting vars)
    const K = dot * ct + cross * st;
    return {
      residuals: [r],
      partials: {
        [`${la.a}.x`]: [-day * K / la2],
        [`${la.a}.y`]: [dax * K / la2],
        [`${la.b}.x`]: [day * K / la2],
        [`${la.b}.y`]: [-dax * K / la2],
        [`${lb.a}.x`]: [dby * K / lb2],
        [`${lb.a}.y`]: [-dbx * K / lb2],
        [`${lb.b}.x`]: [-dby * K / lb2],
        [`${lb.b}.y`]: [dbx * K / lb2],
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

import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpointPerp, angleOfLine, normalizeAngle, distance, toRad } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the angle from line `a` to line `b` to `value` degrees (CCW).
     * Line `a` is the reference; only `b` is rotated. Contributes **1 equation**.
     */
    angle: { a: LineId; b: LineId; value: number };
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

registerConstraint<'angle', ConstraintTypeMap['angle']>({
  type: 'angle',
  label: 'ANG',
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

  presolve(c, { lines, points }) {
    const la = lines.get(c.a);
    const lb = lines.get(c.b);
    if (!la || !lb) return;
    const a1 = points.get(la.a); const a2 = points.get(la.b);
    const b1 = points.get(lb.a); const b2 = points.get(lb.b);
    if (!a1 || !a2 || !b1 || !b2) return;
    if (b1.fixed && b2.fixed) return;

    const targetRad = angleOfLine(a1, a2) + toRad(c.value);
    const len = distance(b1, b2) || 1;
    const cos = Math.cos(targetRad);
    const sin = Math.sin(targetRad);

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
    const targetRad = baseAngle + toRad(c.value);
    const current = angleOfLine(b1, b2);
    const err = Math.abs(normalizeAngle(current - targetRad));
    if (err <= tolerance) return err;
    if (b1.fixed && b2.fixed) return err;

    const len = distance(b1, b2) || 1;
    const cos = Math.cos(targetRad);
    const sin = Math.sin(targetRad);

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
    const angleA = angleOfLine(a1, a2);
    const angleB = angleOfLine(b1, b2);
    return [normalizeAngle(angleB - angleA - toRad(c.value))];
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

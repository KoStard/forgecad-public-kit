import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { angleOfLine, distance, midpointPerp, normalizeAngle } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the angle of a line from the positive X axis to exactly `value` degrees.
     * The direction is enforced as-is (a→b). Contributes **1 equation**:
     * `normalizeAngle(angle − target) = 0`.
     */
    absoluteAngle: { line: LineId; value: number };
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

registerConstraint<'absoluteAngle', ConstraintTypeMap['absoluteAngle']>({
  type: 'absoluteAngle',
  label: '∠',
  isDimension: true,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0, 0];
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return [0, 0];
    return midpointPerp(a, b, 3);
  },

  /**
   * Unconditionally snap the less-constrained endpoint so the line starts
   * at the target angle. Handles zero-length lines (fresh points at the
   * same position) and lines that point in the opposite direction.
   *
   * Which endpoint to move: the point referenced by more lines is likely
   * more constrained — anchor it, move the other.
   */
  presolve(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return;
    if (a.fixed && b.fixed) return;

    const targetRad = (c.value * Math.PI) / 180;
    const len = distance(a, b) || 1;
    const cos = Math.cos(targetRad);
    const sin = Math.sin(targetRad);

    const aRefs = pointLineRefs(line.a, lines);
    const bRefs = pointLineRefs(line.b, lines);

    if (b.fixed || (!a.fixed && bRefs > aRefs)) {
      a.x = b.x - cos * len;
      a.y = b.y - sin * len;
    } else {
      b.x = a.x + cos * len;
      b.y = a.y + sin * len;
    }
  },

  solve(c, { lines, points, tolerance }) {
    const line = lines.get(c.line);
    if (!line) return 0;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return 0;

    const targetRad = (c.value * Math.PI) / 180;
    const current = angleOfLine(a, b);
    const err = Math.abs(normalizeAngle(current - targetRad));
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;

    const len = distance(a, b) || 1;
    const cos = Math.cos(targetRad);
    const sin = Math.sin(targetRad);

    // Move the less-constrained endpoint. The point referenced by more lines
    // is anchored so GS warm-up doesn't corrupt shared points (e.g. the last
    // line in a chain closing back to a triangle vertex).
    const aRefs = pointLineRefs(line.a, lines);
    const bRefs = pointLineRefs(line.b, lines);

    if (b.fixed || (!a.fixed && bRefs > aRefs)) {
      a.x = b.x - cos * len;
      a.y = b.y - sin * len;
    } else {
      b.x = a.x + cos * len;
      b.y = a.y + sin * len;
    }
    return err;
  },

  residual(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0];
    const targetRad = c.value * Math.PI / 180;
    return [normalizeAngle(angleOfLine(a, b) - targetRad)];
  },

  computeDof(c, { refCount, lines }) {
    const line = lines.find((l) => l.id === c.line);
    if (!line) return;
    for (const ptId of [line.a, line.b]) {
      refCount.set(ptId, (refCount.get(ptId) ?? 0) + 1);
    }
  },
});

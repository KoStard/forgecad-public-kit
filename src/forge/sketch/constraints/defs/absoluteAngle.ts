import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { angleOfLine, distance, midpoint, normalizeAngle } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    absoluteAngle: { line: LineId; value: number };
  }
}

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
    return midpoint(a, b);
  },

  solve(c, { lines, points, tolerance }) {
    const line = lines.get(c.line);
    if (!line) return 0;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return 0;

    const targetRad = (c.value * Math.PI) / 180;
    const current = angleOfLine(a, b);
    // Accept line going either direction (θ or θ+π)
    const dFwd = Math.abs(normalizeAngle(current - targetRad));
    const dRev = Math.abs(normalizeAngle(current - (targetRad + Math.PI)));
    const target = dFwd <= dRev ? targetRad : targetRad + Math.PI;
    const err = Math.abs(normalizeAngle(current - target));
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;

    const len = distance(a, b) || 1;
    const cos = Math.cos(target);
    const sin = Math.sin(target);

    if (a.fixed) {
      b.x = a.x + cos * len;
      b.y = a.y + sin * len;
    } else if (b.fixed) {
      a.x = b.x - cos * len;
      a.y = b.y - sin * len;
    } else {
      const [mx, my] = midpoint(a, b);
      const half = len / 2;
      a.x = mx - cos * half; a.y = my - sin * half;
      b.x = mx + cos * half; b.y = my + sin * half;
    }
    return err;
  },


  residual(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0];
    const targetRad = c.value * Math.PI / 180;
    // (b - a) unit vector should equal (cos(target), sin(target))
    // sin(angle - target) = (dy * cos(t) - dx * sin(t)) / len = 0
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return [((b.y - a.y) * Math.cos(targetRad) - (b.x - a.x) * Math.sin(targetRad)) / len];
  },

  computeDof(c, { refCount, lines }) {
    const line = lines.find((l) => l.id === c.line);
    if (!line) return;
    for (const ptId of [line.a, line.b]) {
      refCount.set(ptId, (refCount.get(ptId) ?? 0) + 1);
    }
  },
});

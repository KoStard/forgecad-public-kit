import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, distance, lineDirection } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the length of a line segment to `value`.
     *
     * Endpoints are scaled symmetrically about the line's midpoint while
     * preserving its direction. Contributes **1 equation**:
     * `|b − a| − value = 0`.
     */
    length: { line: LineId; value: number };
  }
}

registerConstraint<'length', ConstraintTypeMap['length']>({
  type: 'length',
  label: 'LEN',
  isDimension: true,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (line) {
      const a = points.get(line.a);
      const b = points.get(line.b);
      if (a && b) return midpointPerp(a, b, 3);
    }
    return [0, 0];
  },

  solve(c, { lines, points, tolerance }) {
    const line = lines.get(c.line);
    if (!line) return 0;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return 0;
    const len = distance(a, b) || 1;
    const err = Math.abs(len - c.value);
    if (err <= tolerance) return err;
    const dir = lineDirection(a, b);
    if (a.fixed && b.fixed) return err;
    if (a.fixed) {
      b.x = a.x + dir[0] * c.value; b.y = a.y + dir[1] * c.value;
    } else if (b.fixed) {
      a.x = b.x - dir[0] * c.value; a.y = b.y - dir[1] * c.value;
    } else {
      const mid = midpoint(a, b);
      a.x = mid[0] - dir[0] * c.value / 2; a.y = mid[1] - dir[1] * c.value / 2;
      b.x = mid[0] + dir[0] * c.value / 2; b.y = mid[1] + dir[1] * c.value / 2;
    }
    return err;
  },


  residual(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0];
    return [Math.hypot(b.x - a.x, b.y - a.y) - c.value];
  },

  computeDof(c, { refCount, lines }) {
    const line = lines.find((l) => l.id === c.line);
    if (line) {
      refCount.set(line.a, (refCount.get(line.a) ?? 0) + 1);
      refCount.set(line.b, (refCount.get(line.b) ?? 0) + 1);
    }
  },
});

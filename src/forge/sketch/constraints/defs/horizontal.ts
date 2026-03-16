import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    horizontal: { line: LineId };
  }
}

registerConstraint<'horizontal', ConstraintTypeMap['horizontal']>({
  type: 'horizontal',
  label: 'H',
  isDimension: false,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (line) {
      const a = points.get(line.a);
      const b = points.get(line.b);
      if (a && b) return midpoint(a, b);
    }
    return [0, 0];
  },

  solve(c, { lines, points, tolerance }) {
    const line = lines.get(c.line);
    if (!line) return 0;
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return 0;
    const err = Math.abs(b.y - a.y);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    const y = (a.y + b.y) / 2;
    if (!a.fixed) a.y = y;
    if (!b.fixed) b.y = y;
    return err;
  },

  computeDof(c, { refCount, lines }) {
    const line = lines.find((l) => l.id === c.line);
    if (line) {
      refCount.set(line.a, (refCount.get(line.a) ?? 0) + 1);
      refCount.set(line.b, (refCount.get(line.b) ?? 0) + 1);
    }
  },
});

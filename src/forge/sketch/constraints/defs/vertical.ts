import type { LineId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    vertical: { line: LineId };
  }
}

registerConstraint<'vertical', ConstraintTypeMap['vertical']>({
  type: 'vertical',
  label: 'V',
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
    const err = Math.abs(b.x - a.x);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    const x = (a.x + b.x) / 2;
    if (!a.fixed) a.x = x;
    if (!b.fixed) b.x = x;
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

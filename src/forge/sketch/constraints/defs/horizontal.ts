import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a line to be horizontal (parallel to the X axis).
     *
     * Both endpoints are moved to their average Y coordinate so the line
     * remains centered in place. Contributes **1 equation**: `b.y − a.y = 0`.
     */
    horizontal: { line: LineId };
  }
}

registerConstraint<'horizontal', ConstraintTypeMap['horizontal']>({
  type: 'horizontal',
  label: 'H',
  isDimension: false,
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

  displayAnnotations(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [];
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [];
    return [{ kind: 'symbol', position: [(a.x+b.x)/2, (a.y+b.y)/2] as [number, number], symbol: 'horizontal' as const }];
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


  residual(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0];
    return [b.y - a.y];
  },

  jacobian(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return { residuals: [0], partials: {} };
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return { residuals: [0], partials: {} };
    return {
      residuals: [b.y - a.y],
      partials: {
        [`${line.a}.y`]: [-1],
        [`${line.b}.y`]: [1],
      },
    };
  },

  computeDof(c, { refCount, lines }) {
    const line = lines.find((l) => l.id === c.line);
    if (line) {
      refCount.set(line.a, (refCount.get(line.a) ?? 0) + 1);
      refCount.set(line.b, (refCount.get(line.b) ?? 0) + 1);
    }
  },
});

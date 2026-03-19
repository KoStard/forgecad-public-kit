import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a line to be vertical (parallel to the Y axis).
     *
     * Both endpoints are moved to their average X coordinate so the line
     * remains centered in place. Contributes **1 equation**: `b.x − a.x = 0`.
     */
    vertical: { line: LineId };
  }
}

registerConstraint<'vertical', ConstraintTypeMap['vertical']>({
  type: 'vertical',
  label: 'V',
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
    return [{ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'vertical' as const }];
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


  residual(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0];
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return [0];
    return [b.x - a.x];
  },

  jacobian(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return { residuals: [0], partials: {} };
    const a = points.get(line.a); const b = points.get(line.b);
    if (!a || !b) return { residuals: [0], partials: {} };
    return {
      residuals: [b.x - a.x],
      partials: {
        [`${line.a}.x`]: [-1],
        [`${line.b}.x`]: [1],
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

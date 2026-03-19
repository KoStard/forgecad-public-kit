import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces a point to sit at the exact midpoint of a line segment.
     *
     * When the midpoint is free the solver snaps it to `(a + b) / 2`. When the
     * midpoint is fixed both line endpoints are translated equally to place their
     * midpoint at the fixed position. Contributes **2 equations**
     * (one per axis): `point − (a + b) / 2 = [0, 0]`.
     */
    midpoint: { point: PointId; line: LineId };
  }
}

registerConstraint<'midpoint', ConstraintTypeMap['midpoint']>({
  type: 'midpoint',
  label: '◆',
  isDimension: false,
  equations: 2,

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
    return [{ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'midpoint' as const }];
  },

  computeDof(c, { refCount }) {
    refCount.set(c.point, (refCount.get(c.point) ?? 0) + 2);
  },
});

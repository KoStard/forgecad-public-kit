import type { LineId, CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, midpointPerp, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains tangency between a line and a circle, or between two circles.
     *
     * **Line–circle** (`line` + `circle`): the perpendicular distance from the
     * circle's center to the infinite line equals the circle's radius.
     *
     * **Circle–circle** (`a` + `b`): the two circles are externally tangent —
     * the distance between centers equals the sum of their radii.
     *
     * Exactly one mode must be active (provide either `line`+`circle` or `a`+`b`).
     * Contributes **1 equation**.
     */
    tangent: { line?: LineId; circle?: CircleId; a?: CircleId; b?: CircleId };
  }
}

registerConstraint<'tangent', ConstraintTypeMap['tangent']>({
  type: 'tangent',
  label: '⊤',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, circles, points }) {
    if (c.line && c.circle) {
      const line = lines.get(c.line);
      if (line) {
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (a && b) return midpoint(a, b);
      }
    } else if (c.a && c.b) {
      const c1 = circles.get(c.a);
      const c2 = circles.get(c.b);
      if (c1 && c2) {
        const p1 = points.get(c1.center);
        const p2 = points.get(c2.center);
        if (p1 && p2) return midpoint(p1, p2);
      }
    }
    return [0, 0];
  },

  displayAnnotations(c, { lines, circles, points }) {
    if (c.line && c.circle) {
      const line = lines.get(c.line);
      if (line) {
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (a && b) return [{ kind: 'symbol', position: midpointPerp(a, b, 3), symbol: 'tangent' as const }];
      }
    } else if (c.a && c.b) {
      const c1 = circles.get(c.a);
      const c2 = circles.get(c.b);
      if (c1 && c2) {
        const p1 = points.get(c1.center);
        const p2 = points.get(c2.center);
        if (p1 && p2) return [{ kind: 'symbol', position: [(p1.x+p2.x)/2, (p1.y+p2.y)/2] as [number, number], symbol: 'tangent' as const }];
      }
    }
    return [];
  },

  computeDof(_c, _ctx) {
    // tangent constrains 1 DOF but it's complex — not tracked for simplicity
  },
});

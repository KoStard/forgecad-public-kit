import type { ArcId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Constrains a line to be tangent to an arc at the arc's start or end point.
     *
     * Tangency requires the line's direction to be perpendicular to the arc's
     * radius at the contact point. Set `atStart: true` to use the arc's start
     * point as the tangency contact; `false` uses the end point.
     *
     * The solver rotates the line (around its midpoint, or from the fixed end)
     * so that `dot(unit_line, unit_radius) = 0`.
     * Contributes **1 equation**.
     */
    lineTangentArc: { line: LineId; arc: ArcId; atStart: boolean };
  }
}

registerConstraint<'lineTangentArc', ConstraintTypeMap['lineTangentArc']>({
  type: 'lineTangentArc',
  label: '⊤',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, arcs, points }) {
    const line = lines.get(c.line);
    const arc = arcs.get(c.arc);
    if (!line || !arc) return [0, 0];
    const pt = points.get(c.atStart ? arc.start : arc.end);
    if (!pt) return [0, 0];
    return [pt.x + 2.5, pt.y + 2.5];
  },

  displayAnnotations(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return [];
    const pt = points.get(c.atStart ? arc.start : arc.end);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x, pt.y] as [number, number], symbol: 'tangent' as const }];
  },

  solve(c, { lines, arcs, points, tolerance }) {
    const line = lines.get(c.line);
    const arc = arcs.get(c.arc);
    if (!line || !arc) return 0;
    const lineA = points.get(line.a);
    const lineB = points.get(line.b);
    const center = points.get(arc.center);
    const tangentPt = points.get(c.atStart ? arc.start : arc.end);
    if (!lineA || !lineB || !center || !tangentPt) return 0;

    // Tangency condition: line direction ⊥ radius at tangent point.
    // cross(lineDir, radiusDir) = 0  →  (bx-ax)*(py-cy) - (by-ay)*(px-cx) = 0
    const rdx = tangentPt.x - center.x;
    const rdy = tangentPt.y - center.y;
    const ldx = lineB.x - lineA.x;
    const ldy = lineB.y - lineA.y;
    const cross = ldx * rdy - ldy * rdx;
    const len = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
    const rLen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    const err = Math.abs(cross) / (len * rLen);
    if (err <= tolerance) return err;

    // Rotate the line so its direction is perpendicular to the radius.
    // Tangent direction at tangent point: (-rdy/rLen, rdx/rLen)
    const tx = -rdy / rLen;
    const ty = rdx / rLen;
    const half = len / 2;
    const mx = (lineA.x + lineB.x) / 2;
    const my = (lineA.y + lineB.y) / 2;

    if (!lineA.fixed && !lineB.fixed) {
      lineA.x = mx - tx * half; lineA.y = my - ty * half;
      lineB.x = mx + tx * half; lineB.y = my + ty * half;
    } else if (lineA.fixed) {
      lineB.x = lineA.x + tx * len; lineB.y = lineA.y + ty * len;
    } else {
      lineA.x = lineB.x - tx * len; lineA.y = lineB.y - ty * len;
    }
    return err;
  },

  residual(c, { lines, arcs, points }) {
    const line = lines.get(c.line); const arc = arcs.get(c.arc);
    if (!line || !arc) return [0];
    const la = points.get(line.a); const lb = points.get(line.b);
    const center = points.get(arc.center);
    const tangentPt = points.get(c.atStart ? arc.start : arc.end);
    if (!la || !lb || !center || !tangentPt) return [0];
    const ldx = lb.x - la.x; const ldy = lb.y - la.y;
    const rdx = tangentPt.x - center.x; const rdy = tangentPt.y - center.y;
    const lenL = Math.hypot(ldx, ldy) || 1;
    const lenR = Math.hypot(rdx, rdy) || 1;
    // Tangency: line direction must be perpendicular to the radius at the tangent point,
    // i.e. dot(unit_line, unit_radius) = 0.
    return [(ldx / lenL) * (rdx / lenR) + (ldy / lenL) * (rdy / lenR)];
  },

  computeDof(_c, _ctx) {},
});

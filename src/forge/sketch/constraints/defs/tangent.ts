import type { LineId, CircleId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, distance } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    tangent: { line?: LineId; circle?: CircleId; a?: CircleId; b?: CircleId };
  }
}

registerConstraint<'tangent', ConstraintTypeMap['tangent']>({
  type: 'tangent',
  label: 'TAN',
  isDimension: false,

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

  solve(c, { lines, circles, points, tolerance }) {
    if (c.line && c.circle) {
      const line = lines.get(c.line);
      const circle = circles.get(c.circle);
      if (!line || !circle) return 0;
      const a = points.get(line.a);
      const b = points.get(line.b);
      const center = points.get(circle.center);
      if (!a || !b || !center) return 0;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const dist = (center.x - a.x) * nx + (center.y - a.y) * ny;
      const err = Math.abs(Math.abs(dist) - circle.radius);
      if (err <= tolerance) return err;
      const shift = dist > 0 ? dist - circle.radius : dist + circle.radius;
      const distA = Math.hypot(a.x - center.x, a.y - center.y);
      const distB = Math.hypot(b.x - center.x, b.y - center.y);
      const moveA = distA <= distB;
      if (moveA) {
        if (!a.fixed) { a.x -= nx * shift; a.y -= ny * shift; }
        else if (!b.fixed) { b.x -= nx * shift; b.y -= ny * shift; }
        else if (!center.fixed) { center.x -= nx * shift; center.y -= ny * shift; }
      } else {
        if (!b.fixed) { b.x -= nx * shift; b.y -= ny * shift; }
        else if (!a.fixed) { a.x -= nx * shift; a.y -= ny * shift; }
        else if (!center.fixed) { center.x -= nx * shift; center.y -= ny * shift; }
      }
      return err;
    }

    if (c.a && c.b) {
      const c1 = circles.get(c.a);
      const c2 = circles.get(c.b);
      if (!c1 || !c2) return 0;
      const p1 = points.get(c1.center);
      const p2 = points.get(c2.center);
      if (!p1 || !p2) return 0;
      const target = c1.radius + c2.radius;
      const len = distance(p1, p2) || 1;
      const err = Math.abs(len - target);
      if (err <= tolerance) return err;
      const dir: [number, number] = [(p2.x - p1.x) / len, (p2.y - p1.y) / len];
      if (p1.fixed && p2.fixed) return err;
      if (p1.fixed) {
        p2.x = p1.x + dir[0] * target; p2.y = p1.y + dir[1] * target;
      } else if (p2.fixed) {
        p1.x = p2.x - dir[0] * target; p1.y = p2.y - dir[1] * target;
      } else {
        const mid = midpoint(p1, p2);
        p1.x = mid[0] - dir[0] * target / 2; p1.y = mid[1] - dir[1] * target / 2;
        p2.x = mid[0] + dir[0] * target / 2; p2.y = mid[1] + dir[1] * target / 2;
      }
      return err;
    }

    return 0;
  },

  computeDof(_c, _ctx) {
    // tangent constrains 1 DOF but it's complex — not tracked for simplicity
  },
});

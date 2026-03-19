import type { LineId, CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, distance } from '../helpers';

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
        if (a && b) return [{ kind: 'symbol', position: [(a.x+b.x)/2, (a.y+b.y)/2] as [number, number], symbol: 'tangent' as const }];
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


  residual(c, { lines, circles, points }) {
    if (c.line && c.circle) {
      const line = lines.get(c.line); const circle = circles.get(c.circle);
      if (!line || !circle) return [0];
      const a = points.get(line.a); const b = points.get(line.b);
      const center = points.get(circle.center);
      if (!a || !b || !center) return [0];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const dist = ((center.x - a.x) * (-dy) + (center.y - a.y) * dx) / len;
      return [Math.abs(dist) - circle.radius];
    }
    if (c.a && c.b) {
      const c1 = circles.get(c.a); const c2 = circles.get(c.b);
      if (!c1 || !c2) return [0];
      const p1 = points.get(c1.center); const p2 = points.get(c2.center);
      if (!p1 || !p2) return [0];
      return [Math.hypot(p2.x - p1.x, p2.y - p1.y) - (c1.radius + c2.radius)];
    }
    return [0];
  },

  jacobian(c, { lines, circles, points }) {
    if (c.line && c.circle) {
      const line = lines.get(c.line); const circle = circles.get(c.circle);
      if (!line || !circle) return { residuals: [0], partials: {} };
      const a = points.get(line.a); const b = points.get(line.b);
      const center = points.get(circle.center);
      if (!a || !b || !center) return { residuals: [0], partials: {} };
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1e-24;
      const len = Math.sqrt(len2);
      const px = center.x - a.x, py = center.y - a.y;
      // Signed perp distance: dist = (py*dx - px*dy) / len
      const S = py * dx - px * dy;
      const dist = S / len;
      const sgn = dist >= 0 ? 1 : -1;
      const r = Math.abs(dist) - circle.radius;
      // ∂|dist|/∂var = sgn * ∂dist/∂var
      // dist = S/len, same structure as pointLineDistance
      return {
        residuals: [r],
        partials: {
          [`${circle.center}.x`]: [sgn * (-dy / len)],
          [`${circle.center}.y`]: [sgn * (dx / len)],
          [`${line.a}.x`]: [sgn * ((dy - py) / len - S * dx / (len * len2))],
          [`${line.a}.y`]: [sgn * ((px - dx) / len - S * dy / (len * len2))],
          [`${line.b}.x`]: [sgn * (py / len + S * dx / (len * len2))],
          [`${line.b}.y`]: [sgn * (-px / len + S * dy / (len * len2))],
          [`${c.circle}.r`]: [-1],
        },
      };
    }
    if (c.a && c.b) {
      const c1 = circles.get(c.a); const c2 = circles.get(c.b);
      if (!c1 || !c2) return { residuals: [0], partials: {} };
      const p1 = points.get(c1.center); const p2 = points.get(c2.center);
      if (!p1 || !p2) return { residuals: [0], partials: {} };
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const d = Math.hypot(dx, dy) || 1e-12;
      const ux = dx / d, uy = dy / d;
      return {
        residuals: [d - (c1.radius + c2.radius)],
        partials: {
          [`${c1.center}.x`]: [-ux],
          [`${c1.center}.y`]: [-uy],
          [`${c2.center}.x`]: [ux],
          [`${c2.center}.y`]: [uy],
          [`${c.a}.r`]: [-1],
          [`${c.b}.r`]: [-1],
        },
      };
    }
    return { residuals: [0], partials: {} };
  },

  computeDof(_c, _ctx) {
    // tangent constrains 1 DOF but it's complex — not tracked for simplicity
  },
});

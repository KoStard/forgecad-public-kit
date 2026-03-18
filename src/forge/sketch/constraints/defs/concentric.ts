import type { CircleId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces two circles to share the same center point.
     *
     * The centers are merged to their average position (or snapped to the fixed
     * one if either is fixed). Contributes **2 equations**
     * (one per axis): `center_b − center_a = [0, 0]`.
     */
    concentric: { a: CircleId; b: CircleId };
  }
}

registerConstraint<'concentric', ConstraintTypeMap['concentric']>({
  type: 'concentric',
  label: '⊚',
  isDimension: false,
  equations: 2,

  displayPosition(c, { circles, points }) {
    const c1 = circles.get(c.a);
    const c2 = circles.get(c.b);
    if (c1 && c2) {
      const p1 = points.get(c1.center);
      const p2 = points.get(c2.center);
      if (p1 && p2) return midpoint(p1, p2);
    }
    return [0, 0];
  },

  displayAnnotations(c, { circles, points }) {
    const c1 = circles.get(c.a);
    const c2 = circles.get(c.b);
    if (!c1 || !c2) return [];
    const p1 = points.get(c1.center);
    const p2 = points.get(c2.center);
    if (!p1 || !p2) return [];
    return [{ kind: 'symbol', position: [(p1.x+p2.x)/2, (p1.y+p2.y)/2] as [number, number], symbol: 'concentric' as const }];
  },

  solve(c, { circles, points, tolerance }) {
    const c1 = circles.get(c.a);
    const c2 = circles.get(c.b);
    if (!c1 || !c2) return 0;
    const p1 = points.get(c1.center);
    const p2 = points.get(c2.center);
    if (!p1 || !p2) return 0;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const err = Math.sqrt(dx * dx + dy * dy);
    if (err <= tolerance) return err;
    if (p1.fixed && p2.fixed) return err;
    if (p1.fixed) {
      p2.x = p1.x; p2.y = p1.y;
    } else if (p2.fixed) {
      p1.x = p2.x; p1.y = p2.y;
    } else {
      const mid = midpoint(p1, p2);
      p1.x = mid[0]; p1.y = mid[1];
      p2.x = mid[0]; p2.y = mid[1];
    }
    return err;
  },


  residual(c, { circles, points }) {
    const c1 = circles.get(c.a); const c2 = circles.get(c.b);
    if (!c1 || !c2) return [0, 0];
    const p1 = points.get(c1.center); const p2 = points.get(c2.center);
    if (!p1 || !p2) return [0, 0];
    return [p2.x - p1.x, p2.y - p1.y];
  },

  computeDof(_c, _ctx) {
    // concentric constrains circle centers — not tracked in point refCount
  },
});

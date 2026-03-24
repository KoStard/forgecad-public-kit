/**
 * Thin TS constraint descriptor for `fixed`.
 *
 * Rust owns solving; this file only declares the public payload shape, equation count,
 * and UI/display metadata used by the builder and viewer.
 */
import type { PointId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Pins a point to an absolute position `(x, y)` in sketch space.
     *
     * Rust treats the point as externally pinned geometry. `equations: 0`
     * is intentional because the point's mobility is removed through the
     * `fixed` flag rather than by adding a residual row.
     */
    fixed: { point: PointId; x: number; y: number };
  }
}

registerConstraint<'fixed', ConstraintTypeMap['fixed']>({
  type: 'fixed',
  label: '⚓',
  isDimension: false,
  equations: 0,

  displayPosition(c, { points }) {
    const pt = points.get(c.point);
    if (pt) return [pt.x + 2.5, pt.y + 2.5];
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const pt = points.get(c.point);
    if (!pt) return [];
    return [{ kind: 'symbol', position: [pt.x + 2.5, pt.y + 2.5] as [number, number], symbol: 'fixed' as const }];
  },
});

import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { angleOfLine, normalizeAngle, distance, midpoint } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces lines `a` and `b` to point in the **same direction** (co-directional).
     *
     * Unlike `parallel` (which allows either co-directional or anti-parallel),
     * this constraint pins the relative direction: `dot(unit_a, unit_b) > 0`
     * AND `cross(unit_a, unit_b) = 0`.
     *
     * Use this with `lineDistance` when the sign of the distance matters —
     * `sameDirection` guarantees the normals point the same way, so positive
     * distance means the same physical side for both lines.
     *
     * Contributes **1 equation**: `cross(unit_a, unit_b) = 0` (parallelism).
     * The co-directional requirement is enforced via presolve/solve (flipping `b`
     * when it points opposite to `a`) and a one-sided residual penalty when
     * anti-parallel.
     */
    sameDirection: { a: LineId; b: LineId };
  }
}

registerConstraint<'sameDirection', ConstraintTypeMap['sameDirection']>({
  type: 'sameDirection',
  label: '⇉',
  isDimension: false,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.a);
    if (!line) return [0, 0];
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [0, 0];
    return [(a.x + b.x) / 2, (a.y + b.y) / 2];
  },

  displayAnnotations(c, { lines, points }): AnnotationElement[] {
    const annotations: AnnotationElement[] = [];
    for (const lineId of [c.a, c.b]) {
      const line = lines.get(lineId);
      if (!line) continue;
      const a = points.get(line.a), b = points.get(line.b);
      if (!a || !b) continue;
      const rotation = Math.atan2(b.y - a.y, b.x - a.x);
      annotations.push({
        kind: 'symbol',
        position: [(a.x + b.x) / 2, (a.y + b.y) / 2],
        symbol: 'parallel',
        rotation,
      });
    }
    return annotations;
  },});

/**
 * If `b` points opposite to `a`, flip `b`'s endpoints so it points the same way.
 */
function flipIfOpposite(
  c: ConstraintTypeMap['sameDirection'],
  lines: ReadonlyMap<string, { a: string; b: string }>,
  points: ReadonlyMap<string, { x: number; y: number; fixed: boolean }>,
): void {
  const la = lines.get(c.a), lb = lines.get(c.b);
  if (!la || !lb) return;
  const a1 = points.get(la.a), a2 = points.get(la.b);
  const b1 = points.get(lb.a), b2 = points.get(lb.b);
  if (!a1 || !a2 || !b1 || !b2) return;

  const dax = a2.x - a1.x, day = a2.y - a1.y;
  const dbx = b2.x - b1.x, dby = b2.y - b1.y;
  const dot = dax * dbx + day * dby;

  if (dot < 0 && !b1.fixed && !b2.fixed) {
    // Swap b's endpoints to reverse its direction
    const tx = b1.x, ty = b1.y;
    b1.x = b2.x; b1.y = b2.y;
    b2.x = tx; b2.y = ty;
  }
}

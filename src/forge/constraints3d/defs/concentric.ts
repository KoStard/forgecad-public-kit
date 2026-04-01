/**
 * concentric — Two axes are colinear (same line in space).
 *
 * Removes 4 DOF: axes parallel (2) + axes pass through same line (2).
 *
 * Residuals:
 *   [0,1]: (a1 × a2) components — axes parallel
 *   [2,3]: ((o2 - o1) × a1) components — origins on same line
 */

import { cross3, sub3 } from '../rodrigues';
import type { Constraint3D, Constraint3DDef, Solver3DContext } from '../types';

export const concentricDef: Constraint3DDef<'concentric'> = {
  type: 'concentric',
  equations: 4,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const axisA = ctx.worldAxis(constraint.refA.bodyId, constraint.refA.featureName);
    const axisB = ctx.worldAxis(constraint.refB.bodyId, constraint.refB.featureName);

    // Parallel: a1 × a2 = 0
    const dirCross = cross3(axisA.direction, axisB.direction);

    // Colinear: (o2 - o1) × a1 = 0
    const delta = sub3(axisB.origin, axisA.origin);
    const offsetCross = cross3(delta, axisA.direction);

    // Pick 2 components from each cross product
    const pickTwo = (v: [number, number, number]): [number, number] => {
      const ax = Math.abs(v[0]);
      const ay = Math.abs(v[1]);
      const az = Math.abs(v[2]);
      if (ax <= ay && ax <= az) return [v[1], v[2]];
      if (ay <= ax && ay <= az) return [v[0], v[2]];
      return [v[0], v[1]];
    };

    const [d0, d1] = pickTwo(dirCross);
    const [o0, o1] = pickTwo(offsetCross);

    return [d0, d1, o0, o1];
  },
};

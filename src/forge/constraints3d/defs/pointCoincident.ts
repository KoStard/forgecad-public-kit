/**
 * pointCoincident — Two points occupy the same position.
 *
 * Removes 3 DOF (all translational).
 *
 * Residuals: [p2.x - p1.x, p2.y - p1.y, p2.z - p1.z]
 */

import type { Constraint3DDef, Constraint3D, Solver3DContext } from '../types';

export const pointCoincidentDef: Constraint3DDef<'pointCoincident'> = {
  type: 'pointCoincident',
  equations: 3,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const pA = ctx.worldPoint(constraint.refA.bodyId, constraint.refA.featureName);
    const pB = ctx.worldPoint(constraint.refB.bodyId, constraint.refB.featureName);

    return [pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]];
  },
};

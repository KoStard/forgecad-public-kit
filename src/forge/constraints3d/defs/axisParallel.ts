/**
 * axisParallel — Two axes are parallel (but not necessarily colinear).
 *
 * Removes 2 DOF (two rotational).
 *
 * Residuals: two components of (a1 × a2).
 */

import { cross3 } from '../rodrigues';
import type { Constraint3D, Constraint3DDef, Solver3DContext } from '../types';

export const axisParallelDef: Constraint3DDef<'axisParallel'> = {
  type: 'axisParallel',
  equations: 2,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const axisA = ctx.worldAxis(constraint.refA.bodyId, constraint.refA.featureName);
    const axisB = ctx.worldAxis(constraint.refB.bodyId, constraint.refB.featureName);

    const c = cross3(axisA.direction, axisB.direction);

    const ax = Math.abs(c[0]);
    const ay = Math.abs(c[1]);
    const az = Math.abs(c[2]);
    if (ax <= ay && ax <= az) return [c[1], c[2]];
    if (ay <= ax && ay <= az) return [c[0], c[2]];
    return [c[0], c[1]];
  },
};

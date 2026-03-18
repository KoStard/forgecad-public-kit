/**
 * pointOnAxis — A point lies on an axis line.
 *
 * Removes 2 DOF.
 *
 * Residual: two components of (p - axisOrigin) × axisDirection
 * (cross product is zero when point is on the line)
 */

import type { Constraint3DDef, Constraint3D, Solver3DContext } from '../types';
import { cross3, sub3 } from '../rodrigues';

export const pointOnAxisDef: Constraint3DDef<'pointOnAxis'> = {
  type: 'pointOnAxis',
  equations: 2,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const point = ctx.worldPoint(constraint.refA.bodyId, constraint.refA.featureName);
    const axis = ctx.worldAxis(constraint.refB.bodyId, constraint.refB.featureName);

    const delta = sub3(point, axis.origin);
    const c = cross3(delta, axis.direction);

    // Pick two components
    const ax = Math.abs(c[0]);
    const ay = Math.abs(c[1]);
    const az = Math.abs(c[2]);
    if (ax <= ay && ax <= az) return [c[1], c[2]];
    if (ay <= ax && ay <= az) return [c[0], c[2]];
    return [c[0], c[1]];
  },
};

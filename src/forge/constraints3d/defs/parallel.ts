/**
 * parallel — Two faces have parallel normals (same or opposite direction).
 *
 * Removes 2 DOF (two rotational).
 *
 * Residuals: two components of (n1 × n2) — cross product is zero when parallel.
 * We pick the two largest components for numerical stability.
 */

import type { Constraint3DDef, Constraint3D, Solver3DContext } from '../types';
import { cross3 } from '../rodrigues';

export const parallelDef: Constraint3DDef<'parallel'> = {
  type: 'parallel',
  equations: 2,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const faceA = ctx.worldFace(constraint.refA.bodyId, constraint.refA.featureName);
    const faceB = ctx.worldFace(constraint.refB.bodyId, constraint.refB.featureName);

    const c = cross3(faceA.normal, faceB.normal);

    // Pick two components with largest absolute values for stability
    const ax = Math.abs(c[0]);
    const ay = Math.abs(c[1]);
    const az = Math.abs(c[2]);

    if (ax <= ay && ax <= az) return [c[1], c[2]]; // drop x
    if (ay <= ax && ay <= az) return [c[0], c[2]]; // drop y
    return [c[0], c[1]]; // drop z
  },
};

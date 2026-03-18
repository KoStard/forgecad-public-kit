/**
 * faceDistance — Two faces parallel at a specified distance.
 *
 * Removes 3 DOF: normals anti-parallel (2) + signed distance along normal (1).
 *
 * Residuals:
 *   [0]: |n1 × n2| — parallel
 *   [1]: n1 · n2 + 1 — anti-parallel (facing each other)
 *   [2]: (c2 - c1) · n1 - value — distance along normal
 */

import type { Constraint3DDef, Constraint3D, Solver3DContext } from '../types';
import { cross3, dot3, sub3, len3 } from '../rodrigues';

export const faceDistanceDef: Constraint3DDef<'faceDistance'> = {
  type: 'faceDistance',
  equations: 3,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const faceA = ctx.worldFace(constraint.refA.bodyId, constraint.refA.featureName);
    const faceB = ctx.worldFace(constraint.refB.bodyId, constraint.refB.featureName);
    const distance = constraint.value ?? 0;

    const n1 = faceA.normal;
    const n2 = faceB.normal;
    const delta = sub3(faceB.center, faceA.center);

    // Anti-parallel normals
    const antiParallel = dot3(n1, n2) + 1;
    const crossMag = len3(cross3(n1, n2));

    // Signed distance along n1
    const signedDist = dot3(delta, n1) - distance;

    return [antiParallel, crossMag, signedDist];
  },
};

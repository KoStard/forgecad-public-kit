/**
 * align — Two faces coincident with same-direction normals.
 *
 * Like flush but normals point the same way (n1 · n2 = +1).
 * Removes 3 DOF.
 */

import { dot3, sub3 } from '../rodrigues';
import type { Constraint3D, Constraint3DDef, Solver3DContext } from '../types';

export const alignDef: Constraint3DDef<'align'> = {
  type: 'align',
  equations: 3,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const faceA = ctx.worldFace(constraint.refA.bodyId, constraint.refA.featureName);
    const faceB = ctx.worldFace(constraint.refB.bodyId, constraint.refB.featureName);

    const n1 = faceA.normal;
    const n2 = faceB.normal;
    const delta = sub3(faceB.center, faceA.center);

    // Normals parallel: n1 · n2 = +1
    const parallel = dot3(n1, n2) - 1;

    // Coplanar
    const normalDist = dot3(delta, n1);

    // Cross product magnitude (should be 0 for parallel)
    const cx = n1[1] * n2[2] - n1[2] * n2[1];
    const cy = n1[2] * n2[0] - n1[0] * n2[2];
    const cz = n1[0] * n2[1] - n1[1] * n2[0];
    const crossMag = Math.sqrt(cx * cx + cy * cy + cz * cz);

    return [parallel, crossMag, normalDist];
  },
};

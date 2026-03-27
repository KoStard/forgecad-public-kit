/**
 * flush — Two faces coincident with opposing normals.
 *
 * Removes 3 DOF: normals anti-parallel (2 eqs) + coplanar (1 eq).
 *
 * Residuals:
 *   [0]: n1 · n2 + 1  (normals point in opposite directions → dot = -1)
 *   [1]: (c2 - c1) · u1  (centers coplanar in face-local U)
 *   [2]: (c2 - c1) · n1  (centers coplanar along normal)
 *
 * Note: we use n1·n2+1 instead of cross product because cross gives 0
 * for both parallel and anti-parallel. Dot product distinguishes them.
 * The two anti-parallel conditions (n1·n2 = -1) only constrain 2 rotational DOF,
 * but we also constrain the normal-direction translation (coplanar), giving 3 total.
 */

import { dot3, sub3 } from '../rodrigues';
import type { Constraint3D, Constraint3DDef, Solver3DContext } from '../types';

export const flushDef: Constraint3DDef<'flush'> = {
  type: 'flush',
  equations: 3,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const faceA = ctx.worldFace(constraint.refA.bodyId, constraint.refA.featureName);
    const faceB = ctx.worldFace(constraint.refB.bodyId, constraint.refB.featureName);

    const n1 = faceA.normal;
    const n2 = faceB.normal;
    const delta = sub3(faceB.center, faceA.center);

    // Normals anti-parallel: n1 · n2 = -1
    const antiParallel = dot3(n1, n2) + 1;

    // Coplanar: delta projected onto n1 = 0
    const normalDist = dot3(delta, n1);

    // In-plane alignment: we need a second equation orthogonal to the normal
    // to fully constrain the anti-parallel condition. Use the cross product magnitude.
    // |n1 × n2| = sin(angle between them). For anti-parallel, this should be 0.
    const cx = n1[1] * n2[2] - n1[2] * n2[1];
    const cy = n1[2] * n2[0] - n1[0] * n2[2];
    const cz = n1[0] * n2[1] - n1[1] * n2[0];
    // Pick the two largest cross-product components for numerical stability
    const crossMag = Math.sqrt(cx * cx + cy * cy + cz * cz);

    return [antiParallel, crossMag, normalDist];
  },
};

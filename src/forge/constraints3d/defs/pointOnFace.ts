/**
 * pointOnFace — A point lies on a face's plane.
 *
 * Removes 1 DOF.
 *
 * Residual: [(p - faceCenter) · faceNormal]
 */

import type { Constraint3DDef, Constraint3D, Solver3DContext } from '../types';
import { dot3, sub3 } from '../rodrigues';

export const pointOnFaceDef: Constraint3DDef<'pointOnFace'> = {
  type: 'pointOnFace',
  equations: 1,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const point = ctx.worldPoint(constraint.refA.bodyId, constraint.refA.featureName);
    const face = ctx.worldFace(constraint.refB.bodyId, constraint.refB.featureName);

    const delta = sub3(point, face.center);
    return [dot3(delta, face.normal)];
  },
};

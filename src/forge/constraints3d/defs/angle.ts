/**
 * angle — Dihedral angle between two face normals.
 *
 * Removes 1 DOF.
 *
 * Residual: [n1 · n2 - cos(θ)]
 * where θ = constraint.value in degrees.
 */

import type { Constraint3DDef, Constraint3D, Solver3DContext } from '../types';
import { dot3 } from '../rodrigues';

export const angleDef: Constraint3DDef<'angle'> = {
  type: 'angle',
  equations: 1,
  residual(constraint: Constraint3D, ctx: Solver3DContext): number[] {
    const faceA = ctx.worldFace(constraint.refA.bodyId, constraint.refA.featureName);
    const faceB = ctx.worldFace(constraint.refB.bodyId, constraint.refB.featureName);
    const angleDeg = constraint.value ?? 0;
    const angleRad = angleDeg * Math.PI / 180;

    return [dot3(faceA.normal, faceB.normal) - Math.cos(angleRad)];
  },
};

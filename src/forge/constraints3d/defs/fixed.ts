/**
 * fixed — Lock a body at its current pose.
 *
 * This is implemented via the grounded flag on RigidBody,
 * not as a residual constraint. Included for API completeness.
 *
 * Removes 6 DOF (all translational + rotational).
 */

import type { Constraint3D, Constraint3DDef, Solver3DContext } from '../types';

export const fixedDef: Constraint3DDef<'fixed'> = {
  type: 'fixed',
  equations: 0,
  residual(_constraint: Constraint3D, _ctx: Solver3DContext): number[] {
    return [];
  },
};

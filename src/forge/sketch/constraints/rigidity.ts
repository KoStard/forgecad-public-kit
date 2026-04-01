/**
 * Compatibility wrapper for rigidity-style diagnostics.
 *
 * The actual analysis now comes from Rust solve metadata; this file keeps the old TS API shape.
 */
import type { ConstraintDefinition } from './types';
import { getConstraintDef, solveConstraints } from './registry';
import { cloneDefinition } from './sketch';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RigidityResult {
  /** Total DOF of the system (2n - m for n free points, m constraint equations). */
  totalDof: number;
  /** IDs of constraints that are structurally redundant (over-constrained). */
  redundantConstraintIds: Set<string>;
  /** IDs of constraints that are independent (needed for rigidity). */
  independentConstraintIds: Set<string>;
  /** True if the system is generically rigid (no under-determined subset). */
  isRigid: boolean;
}

export function analyzeRigidity(def: ConstraintDefinition): RigidityResult {
  const working = cloneDefinition(def);
  const { metadata } = solveConstraints(working, {}, 'rigidity.analyze');
  const totalDof = metadata?.dof ?? 0;
  const redundantConstraintIds = new Set(metadata?.redundantConstraintIds ?? []);
  const conflictingConstraintIds = new Set(metadata?.conflictingConstraintIds ?? []);
  const independentConstraintIds = new Set(
    working.constraints
      .filter((constraint) => {
        const equations = getConstraintDef(constraint.type)?.equations ?? 0;
        return equations > 0 && !redundantConstraintIds.has(constraint.id) && !conflictingConstraintIds.has(constraint.id);
      })
      .map((constraint) => constraint.id),
  );

  return {
    totalDof,
    redundantConstraintIds,
    independentConstraintIds,
    isRigid: totalDof <= 0 && redundantConstraintIds.size === 0 && conflictingConstraintIds.size === 0,
  };
}

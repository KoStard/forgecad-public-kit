import type { ConstraintDefinition } from './types';
import { getConstraintDef, solveConstraints } from './registry';

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
  const { metadata } = solveConstraints(working, {});
  const totalDof = metadata?.dof ?? 0;
  const redundantConstraintIds = new Set(metadata?.redundantConstraintIds ?? []);
  const conflictingConstraintIds = new Set(metadata?.conflictingConstraintIds ?? []);
  const independentConstraintIds = new Set(
    working.constraints
      .filter((constraint) => {
        const equations = getConstraintDef(constraint.type)?.equations ?? 0;
        return equations > 0
          && !redundantConstraintIds.has(constraint.id)
          && !conflictingConstraintIds.has(constraint.id);
      })
      .map((constraint) => constraint.id),
  );

  return {
    totalDof,
    redundantConstraintIds,
    independentConstraintIds,
    isRigid: totalDof <= 0
      && redundantConstraintIds.size === 0
      && conflictingConstraintIds.size === 0,
  };
}

function cloneDefinition(def: ConstraintDefinition): ConstraintDefinition {
  return {
    points: def.points.map((point) => ({ ...point })),
    lines: def.lines.map((line) => ({ ...line })),
    circles: def.circles.map((circle) => ({ ...circle })),
    arcs: (def.arcs ?? []).map((arc) => ({ ...arc })),
    shapes: (def.shapes ?? []).map((shape) => ({ ...shape, lines: [...shape.lines] })),
    loops: def.loops.map((loop) => {
      if (loop.type === 'poly') return { type: 'poly', points: [...loop.points] };
      if (loop.type === 'circle') return { type: 'circle', circle: loop.circle };
      return { type: 'profile', segments: loop.segments.map((segment) => ({ ...segment })) };
    }),
    constraints: def.constraints.map((constraint) => ({ ...constraint } as typeof constraint)),
    rejectedConstraints: def.rejectedConstraints.map((constraint) => ({ ...constraint } as typeof constraint)),
    rejectionReasons: def.rejectionReasons ? new Map(def.rejectionReasons) : undefined,
  };
}

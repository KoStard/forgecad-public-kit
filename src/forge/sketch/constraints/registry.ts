import type {
  ConstraintDef,
  ConstraintDefinition,
  ConstraintDisplay,
  ConstraintType,
  DisplayContext,
  SketchConstraint,
  SolveOptions,
} from './types';
import { solveConstraintsWasm } from './solver-wasm';

// ─── Registry ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ConstraintDef<string, any>>();

export function registerConstraint<TType extends string, TData extends object>(
  def: ConstraintDef<TType, TData>,
): void {
  registry.set(def.type, def as unknown as ConstraintDef<string, object>);
}

export function getConstraintDef(type: string): ConstraintDef | undefined {
  return registry.get(type);
}

// ─── Builder method installation ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installBuilderMethod(type: string, fn: (...args: any[]) => any): void {
  // Deferred — applied by builder.ts after class definition.
  // builder.ts calls applyBuilderMethods(); each def file calls installBuilderMethod()
  // which stores the fn here, and builder picks them up.
  pendingBuilderMethods.set(type, fn);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingBuilderMethods = new Map<string, (...args: any[]) => any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPendingBuilderMethods(): Map<string, (...args: any[]) => any> {
  return pendingBuilderMethods;
}

// ─── Registry-derived helpers ──────────────────────────────────────────────────

export const buildLabel = (type: ConstraintType | string): string =>
  registry.get(type)?.label ?? 'C';

export const isDimensionConstraint = (type: ConstraintType | string): boolean =>
  registry.get(type)?.isDimension ?? false;

export const getConstraintValue = (constraint: SketchConstraint): number | undefined => {
  const def = registry.get(constraint.type);
  if (!def?.isDimension) return undefined;
  return (constraint as unknown as { value?: number }).value;
};

export const setConstraintValue = (constraint: SketchConstraint, value: number): void => {
  const def = registry.get(constraint.type);
  if (!def?.isDimension) return;
  (constraint as unknown as { value: number }).value = value;
};

// ─── Solver ────────────────────────────────────────────────────────────────────

export const DEFAULT_TOLERANCE = 1e-3;

export const solveConstraints = (
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number } => solveConstraintsWasm(def, options);

// ─── Display ───────────────────────────────────────────────────────────────────

export const buildConstraintDisplays = (
  def: ConstraintDefinition,
  conflictingIds: Set<string>,
  redundantIds: Set<string> = new Set(),
  rejectionReasons?: Map<string, string>,
): ConstraintDisplay[] => {
  const ctx: DisplayContext = {
    points: new Map(def.points.map((p) => [p.id, p] as const)),
    lines: new Map(def.lines.map((l) => [l.id, l] as const)),
    circles: new Map(def.circles.map((c) => [c.id, c] as const)),
    arcs: new Map((def.arcs ?? []).map((a) => [a.id, a] as const)),
    shapes: new Map((def.shapes ?? []).map((s) => [s.id, s] as const)),
  };

  // Build a solver context for residual evaluation (extends DisplayContext with tolerance and movePoint).
  const solverCtx = { ...ctx, tolerance: DEFAULT_TOLERANCE, movePoint: () => false as boolean };

  const displays = def.constraints.map((constraint) => {
    const constraintDef = registry.get(constraint.type);
    const position: [number, number] = constraintDef
      ? constraintDef.displayPosition(constraint as never, ctx)
      : [0, 0];

    // Extract entity IDs from constraint fields.
    const entityIds: string[] = [];
    for (const [key, val] of Object.entries(constraint)) {
      if (key === 'id' || key === 'type') continue;
      if (typeof val === 'string') entityIds.push(val);
      else if (Array.isArray(val)) {
        for (const v of val) { if (typeof v === 'string') entityIds.push(v); }
      }
    }

    // Compute per-constraint residual.
    let residual = 0;
    if (constraintDef?.residual) {
      const res = constraintDef.residual(constraint as never, solverCtx);
      residual = Math.max(...res.map(Math.abs));
    }

    return {
      id: constraint.id,
      type: constraint.type,
      label: buildLabel(constraint.type),
      position,
      value: getConstraintValue(constraint),
      isDimension: isDimensionConstraint(constraint.type),
      isConflicting: conflictingIds.has(constraint.id),
      isRedundant: redundantIds.has(constraint.id),
      rejectionReason: rejectionReasons?.get(constraint.id),
      entityIds,
      residual,
    };
  });

  // Iteratively spread labels that are too close together.
  const MIN_SEP = 5;
  const pos = displays.map((d) => [d.position[0], d.position[1]] as [number, number]);
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j][0] - pos[i][0];
        const dy = pos[j][1] - pos[i][1];
        const d = Math.hypot(dx, dy);
        if (d < MIN_SEP) {
          const push = (MIN_SEP - d) / 2 + 0.05;
          let nx: number; let ny: number;
          if (d < 0.01) {
            // Exact overlap — use index-based angle to break symmetry
            const a = (i * Math.PI * 2) / Math.max(displays.length, 2);
            nx = Math.cos(a); ny = Math.sin(a);
          } else {
            nx = dx / d; ny = dy / d;
          }
          pos[i][0] -= nx * push; pos[i][1] -= ny * push;
          pos[j][0] += nx * push; pos[j][1] += ny * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return displays.map((d, i) => ({ ...d, position: pos[i] }));
};

// ─── DOF / status computation ──────────────────────────────────────────────────

export const computeStatus = (
  def: ConstraintDefinition,
  maxError: number,
  tolerance: number,
): { status: 'under' | 'fully' | 'over' | 'over-redundant'; dof: number } => {
  // Free variables: each non-fixed point contributes 2 (x, y);
  // each non-fixedRadius circle contributes 1 (radius);
  // each arc contributes 1 (radius) but its implicit constraints remove 2,
  // so net arc contribution = 1 - 2 = -1 (already partially constrained by definition).
  const freeVars =
    def.points.filter((p) => !p.fixed).length * 2 +
    def.circles.filter((c) => !c.fixedRadius).length +
    (def.arcs ?? []).length * (1 - 2); // radius DOF minus 2 implicit equations

  // Constraint equations: sum of equations declared by each constraint def.
  // 'fixed' constraints declare equations=0 because pt.fixed already removes the point's DOF.
  const constraintEqs = def.constraints.reduce((sum, c) => {
    const cdef = registry.get(c.type);
    return sum + (cdef?.equations ?? 0);
  }, 0);

  const dof = freeVars - constraintEqs;

  // Conflict: solver failed to satisfy the constraints.
  if (maxError > tolerance * 5) return { status: 'over', dof };
  if (dof > 0) return { status: 'under', dof };
  // DOF < 0 but converged: constraints are redundant, not conflicting.
  if (dof < 0) return { status: 'over-redundant', dof };
  return { status: 'fully', dof: 0 };
};

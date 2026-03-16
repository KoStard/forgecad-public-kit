import type {
  ConstraintDef,
  ConstraintDefinition,
  ConstraintDisplay,
  ConstraintType,
  DofContext,
  DisplayContext,
  PointId,
  SketchConstraint,
  SketchPoint,
  SolverContext,
  SolveOptions,
} from './types';

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
): { maxError: number } => {
  const iterations = options.iterations ?? 40;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const points = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = new Map(def.lines.map((l) => [l.id, l] as const));
  const circles = new Map(def.circles.map((c) => [c.id, c] as const));
  const shapes = new Map((def.shapes ?? []).map((s) => [s.id, s] as const));

  const movePoint = (pt: SketchPoint, dx: number, dy: number): boolean => {
    if (pt.fixed) return false;
    pt.x += dx;
    pt.y += dy;
    return true;
  };

  const ctx: SolverContext = { points, lines, circles, shapes, tolerance, movePoint };

  // Pre-solve pass (e.g. fixed constraint pins points before iteration)
  def.constraints.forEach((constraint) => {
    const constraintDef = registry.get(constraint.type);
    constraintDef?.presolve?.(constraint as never, ctx);
  });

  let maxError = 0;

  for (let i = 0; i < iterations; i += 1) {
    maxError = 0;
    def.constraints.forEach((constraint) => {
      const constraintDef = registry.get(constraint.type);
      if (!constraintDef) return;
      const err = constraintDef.solve(constraint as never, ctx);
      maxError = Math.max(maxError, err);
    });
    if (maxError <= tolerance) break;
  }

  return { maxError };
};

// ─── Display ───────────────────────────────────────────────────────────────────

export const buildConstraintDisplays = (
  def: ConstraintDefinition,
  conflictingIds: Set<string>,
): ConstraintDisplay[] => {
  const ctx: DisplayContext = {
    points: new Map(def.points.map((p) => [p.id, p] as const)),
    lines: new Map(def.lines.map((l) => [l.id, l] as const)),
    circles: new Map(def.circles.map((c) => [c.id, c] as const)),
    shapes: new Map((def.shapes ?? []).map((s) => [s.id, s] as const)),
  };

  return def.constraints.map((constraint) => {
    const constraintDef = registry.get(constraint.type);
    const position: [number, number] = constraintDef
      ? constraintDef.displayPosition(constraint as never, ctx)
      : [0, 0];

    return {
      id: constraint.id,
      type: constraint.type,
      label: buildLabel(constraint.type),
      position,
      value: getConstraintValue(constraint),
      isDimension: isDimensionConstraint(constraint.type),
      isConflicting: conflictingIds.has(constraint.id),
    };
  });
};

// ─── DOF / status computation ──────────────────────────────────────────────────

export const computeStatus = (
  def: ConstraintDefinition,
  maxError: number,
  tolerance: number,
): 'under' | 'fully' | 'over' => {
  if (maxError > tolerance * 5) return 'over';

  const refCount = new Map<PointId, number>();
  def.points.forEach((p) => refCount.set(p.id, 0));

  const dofCtx: DofContext = { refCount, lines: def.lines, shapes: new Map((def.shapes ?? []).map((s) => [s.id, s] as const)) };

  def.constraints.forEach((constraint) => {
    const constraintDef = registry.get(constraint.type);
    constraintDef?.computeDof(constraint as never, dofCtx);
  });

  const under = def.points.some((p) => !p.fixed && (refCount.get(p.id) ?? 0) < 2);
  return under ? 'under' : 'fully';
};

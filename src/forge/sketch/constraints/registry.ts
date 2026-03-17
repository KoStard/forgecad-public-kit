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

// ─── Newton-Raphson solver helpers ─────────────────────────────────────────────

/**
 * Solve a square or over-determined linear system A·x = b using Gauss-Newton
 * (normal equations: Aᵀ·A·x = Aᵀ·b) with partial pivoting.
 * A is m×n (m equations, n variables). Returns Δx of length n.
 */
const gaussNewtonStep = (J: number[][], r: number[]): number[] => {
  const m = J.length;
  const n = m > 0 ? J[0].length : 0;
  if (n === 0) return [];

  // Form Jᵀ·J (n×n) and Jᵀ·r (n)
  const JtJ: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, k) =>
      J.reduce((s, row) => s + row[i] * row[k], 0),
    ),
  );
  const JtR: number[] = Array.from({ length: n }, (_, i) =>
    -J.reduce((s, row, ri) => s + row[i] * r[ri], 0),
  );

  // Gaussian elimination with partial pivoting on augmented [JtJ | JtR]
  const aug = JtJ.map((row, i) => [...row, JtR[i]]);
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxVal = Math.abs(aug[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > maxVal) { maxVal = Math.abs(aug[k][i]); maxRow = k; }
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    if (Math.abs(aug[i][i]) < 1e-14) continue; // singular — skip
    for (let k = i + 1; k < n; k++) {
      const f = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) aug[k][j] -= f * aug[i][j];
    }
  }
  // Back substitution
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-14) continue;
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
};

/** Newton-Raphson solver using residuals and numerical Jacobian estimation. */
const solveNR = (
  def: ConstraintDefinition,
  ctx: SolverContext,
  maxIter: number,
  tolerance: number,
): number => {
  const freePoints = def.points.filter((p) => !p.fixed);
  const freeCircles = def.circles.filter((c) => !c.fixedRadius);
  const n = freePoints.length * 2 + freeCircles.length;
  if (n === 0) return 0;

  const getVars = (): number[] => [
    ...freePoints.flatMap((p) => [p.x, p.y]),
    ...freeCircles.map((c) => c.radius),
  ];

  const applyVars = (vars: number[]): void => {
    let i = 0;
    for (const p of freePoints) { p.x = vars[i++]; p.y = vars[i++]; }
    for (const c of freeCircles) { c.radius = vars[i++]; }
    // Keep Maps in sync (they hold references, so x/y mutations propagate automatically)
  };

  const computeResiduals = (): number[] => {
    const r: number[] = [];
    for (const constraint of def.constraints) {
      const cdef = registry.get(constraint.type);
      if (!cdef?.residual) return []; // fallback signal
      r.push(...cdef.residual(constraint as never, ctx));
    }
    return r;
  };

  // Step size for numerical Jacobian finite differences.
  const EPS = 1e-6;
  let maxError = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    const r0 = computeResiduals();
    if (r0.length === 0) return -1; // signal: fall back to GS
    maxError = Math.max(...r0.map(Math.abs), 0);
    if (maxError <= tolerance) break;

    const vars = getVars();
    // Numerical Jacobian: build column-by-column via forward finite differences.
    const Jcols: number[][] = [];
    for (let j = 0; j < n; j++) {
      vars[j] += EPS;
      applyVars(vars);
      const r1 = computeResiduals();
      vars[j] -= EPS;
      applyVars(vars);
      Jcols.push(r1.map((ri, i) => (ri - r0[i]) / EPS));
    }
    // J is currently n columns of length m; reshape to m rows of n.
    const m = r0.length;
    const J: number[][] = Array.from({ length: m }, (_, i) => Jcols.map((col) => col[i]));

    const dx = gaussNewtonStep(J, r0);
    if (dx.length === 0) break;

    // Armijo backtracking line search: halve the step until residual norm decreases.
    const norm0 = r0.reduce((s, v) => s + v * v, 0);
    let alpha = 1.0;
    for (let ls = 0; ls < 8; ls++) {
      const trial = vars.map((v, j) => v + alpha * dx[j]);
      applyVars(trial);
      const rTrial = computeResiduals();
      if (rTrial.reduce((s, v) => s + v * v, 0) < norm0) break;
      alpha *= 0.5;
    }
  }

  // All mutations applied in-place — freePoints/freeCircles share objects with def.points/circles.
  // Recompute max error from all residuals
  const rFinal = computeResiduals();
  return rFinal.length > 0 ? Math.max(...rFinal.map(Math.abs), 0) : maxError;
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

  const arcs = new Map((def.arcs ?? []).map((a) => [a.id, a] as const));
  const ctx: SolverContext = { points, lines, circles, arcs, shapes, tolerance, movePoint };

  // Pre-solve pass (e.g. fixed constraint pins points before iteration)
  def.constraints.forEach((constraint) => {
    const constraintDef = registry.get(constraint.type);
    constraintDef?.presolve?.(constraint as never, ctx);
  });

  // Check whether all active constraints define residuals (prerequisite for NR).
  const canUseNR = def.constraints.every((c) => {
    const cdef = registry.get(c.type);
    return cdef?.residual != null;
  });

  let maxError = 0;

  if (canUseNR && def.constraints.length > 0) {
    // ── Newton-Raphson path ──────────────────────────────────────────────────
    const nrResult = solveNR(def, ctx, iterations, tolerance);
    if (nrResult >= 0) {
      maxError = nrResult;
    } else {
      // NR signalled fallback (missing residual mid-run) — drop to GS below
      maxError = tolerance + 1;
    }
    // After NR, also enforce arc implicit constraints once.
    arcs.forEach((arc) => {
      const center = points.get(arc.center);
      const start = points.get(arc.start);
      const end = points.get(arc.end);
      if (!center || !start || !end) return;
      const ds = Math.hypot(start.x - center.x, start.y - center.y);
      const de = Math.hypot(end.x - center.x, end.y - center.y);
      arc.radius = (ds + de) / 2;
    });
  }

  if (!canUseNR || maxError > tolerance) {
    // ── Gauss-Seidel fallback ────────────────────────────────────────────────
    for (let i = 0; i < iterations; i += 1) {
      maxError = 0;
      def.constraints.forEach((constraint) => {
        const constraintDef = registry.get(constraint.type);
        if (!constraintDef) return;
        const err = constraintDef.solve(constraint as never, ctx);
        maxError = Math.max(maxError, err);
      });
      // Enforce implicit arc constraints every GS iteration.
      arcs.forEach((arc) => {
        const center = points.get(arc.center);
        const start = points.get(arc.start);
        const end = points.get(arc.end);
        if (!center || !start || !end) return;
        const ds = Math.hypot(start.x - center.x, start.y - center.y);
        const de = Math.hypot(end.x - center.x, end.y - center.y);
        arc.radius = (ds + de) / 2;
        if (arc.radius < 1e-9) return;
        if (!start.fixed && ds > 1e-9) {
          const s = arc.radius / ds;
          start.x = center.x + (start.x - center.x) * s;
          start.y = center.y + (start.y - center.y) * s;
        }
        if (!end.fixed && de > 1e-9) {
          const s = arc.radius / de;
          end.x = center.x + (end.x - center.x) * s;
          end.y = center.y + (end.y - center.y) * s;
        }
        maxError = Math.max(maxError, Math.abs(ds - arc.radius), Math.abs(de - arc.radius));
      });
      if (maxError <= tolerance) break;
    }
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
    arcs: new Map((def.arcs ?? []).map((a) => [a.id, a] as const)),
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
  // Conflict/over-constraint: solver failed to satisfy the constraints.
  if (maxError > tolerance * 5) return 'over';

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
  if (dof > 0) return 'under';
  if (dof < 0) return 'over';
  return 'fully';
};

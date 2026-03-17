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

// ─── Newton-Raphson / Levenberg-Marquardt solver ────────────────────────────────
//
// The constraint solver faces two distinct challenges:
//
// 1. ILL-CONDITIONED JACOBIANS — When many constraints couple the same points,
//    the normal-equation matrix JᵀJ can become nearly singular.  Pure Gauss-Newton
//    produces huge, unreliable steps.  Levenberg-Marquardt adds λ·I to JᵀJ,
//    smoothly interpolating between Gauss-Newton (λ→0, fast quadratic convergence
//    near the solution) and gradient descent (λ→∞, always makes progress).  λ
//    adapts each iteration: decreases on a successful step, increases on failure.
//
// 2. MULTIPLE BASINS OF ATTRACTION — Angle-wrapping (normalizeAngle maps to
//    [-π, π]) creates a non-convex residual landscape with multiple local minima.
//    For example, a line can satisfy an absolute-angle constraint at the target
//    angle OR at target ± π (pointing backwards), and coupled constraints can
//    trap the solver in a state offset by exactly π/2.  No gradient-based method
//    can escape a local minimum — the gradient points downhill toward the wrong
//    solution.  The fix is multi-start: if the first attempt fails, perturb free
//    points (after GS warm-up, using golden-angle spacing for uniform directional
//    coverage) and retry.  Typically 2-3 attempts suffice for 2D sketch systems.
//
// Solver pipeline per attempt:
//   1. GS warm-up (15 iterations) — break degeneracy, propagate constraints
//   2. Perturbation (attempts > 0) — explore a different basin
//   3. LM-NR (40 iterations) — quadratic convergence from the warm-up basin
//   4. GS fallback (200 iterations) — if NR didn't converge, linear GS as safety net
//   5. NR retry — GS may have moved points to a better basin; one more NR pass
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Solve a square or over-determined linear system A·x = b using Gauss-Newton
 * (normal equations: Aᵀ·A·x = Aᵀ·b) with partial pivoting, plus optional
 * Levenberg-Marquardt damping.  lambda > 0 adds lambda·I to Jᵀ·J, regularising
 * ill-conditioned systems and biasing the step toward gradient descent.
 * A is m×n (m equations, n variables). Returns Δx of length n.
 */
const gaussNewtonStep = (J: number[][], r: number[], lambda = 0): number[] => {
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

  // Levenberg-Marquardt damping: regularises JᵀJ so the system is always solvable.
  // Large lambda → gradient-descent direction (safe, slow).
  // Small lambda → Gauss-Newton direction (fast when near solution).
  if (lambda > 0) {
    for (let i = 0; i < n; i++) JtJ[i][i] += lambda;
  }

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
  // Levenberg-Marquardt damping factor.  Starts moderate; adapts each iteration:
  // decreases (→ Gauss-Newton) after a successful step, increases (→ gradient descent)
  // after a failed one.  This guarantees monotone progress even when the Jacobian is
  // ill-conditioned — the key property that makes complex constraint systems converge.
  let lambda = 0.1;

  for (let iter = 0; iter < maxIter; iter++) {
    const r0 = computeResiduals();
    if (r0.length === 0) return -1; // signal: fall back to GS
    maxError = Math.max(...r0.map(Math.abs), 0);
    if (maxError <= tolerance) break;

    const vars = getVars();
    const norm0 = r0.reduce((s, v) => s + v * v, 0);

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

    // LM step: (JᵀJ + lambda·I)·dx = −Jᵀr
    const dx = gaussNewtonStep(J, r0, lambda);
    if (dx.length === 0) break;

    const trial = vars.map((v, j) => v + dx[j]);
    applyVars(trial);
    const rTrial = computeResiduals();
    const norm1 = rTrial.reduce((s, v) => s + v * v, 0);

    if (norm1 < norm0) {
      // Good step — reduce damping toward Gauss-Newton (faster convergence).
      lambda = Math.max(lambda / 3, 1e-10);
    } else {
      // Bad step — revert and increase damping toward gradient descent (safer).
      applyVars(vars);
      lambda = Math.min(lambda * 10, 1e8);
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

  // ── State snapshot helpers (index-aligned with def arrays for O(1) save/restore) ──
  const defArcs = def.arcs ?? [];
  const saveState = () => ({
    pts: def.points.map(p => [p.x, p.y] as [number, number]),
    radii: def.circles.map(c => c.radius),
    arcRadii: defArcs.map(a => a.radius),
  });
  type Snapshot = ReturnType<typeof saveState>;
  const restoreState = (s: Snapshot) => {
    for (let i = 0; i < def.points.length; i++) {
      def.points[i].x = s.pts[i][0];
      def.points[i].y = s.pts[i][1];
    }
    for (let i = 0; i < def.circles.length; i++) def.circles[i].radius = s.radii[i];
    for (let i = 0; i < defArcs.length; i++) defArcs[i].radius = s.arcRadii[i];
  };

  // ── Shared subroutines for warmup / NR / GS (avoid duplication) ───────────
  const gsPass = () => {
    def.constraints.forEach((constraint) => {
      const constraintDef = registry.get(constraint.type);
      if (!constraintDef) return;
      constraintDef.solve(constraint as never, ctx);
    });
  };

  const enforceArcImplicit = (snap = false): number => {
    let arcErr = 0;
    arcs.forEach((arc) => {
      const center = points.get(arc.center);
      const start = points.get(arc.start);
      const end = points.get(arc.end);
      if (!center || !start || !end) return;
      const ds = Math.hypot(start.x - center.x, start.y - center.y);
      const de = Math.hypot(end.x - center.x, end.y - center.y);
      arc.radius = (ds + de) / 2;
      if (arc.radius < 1e-9) return;
      if (snap) {
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
      }
      arcErr = Math.max(arcErr, Math.abs(ds - arc.radius), Math.abs(de - arc.radius));
    });
    return arcErr;
  };

  // Save state after presolve (fixed points pinned, others at user-specified positions).
  const initialState = saveState();
  let bestError = Infinity;
  let bestState: Snapshot = initialState;

  // ── Multi-attempt solve ────────────────────────────────────────────────────
  // Angle-wrapping constraints (normalizeAngle → [-π, π]) create a non-convex
  // residual landscape with multiple local minima.  The solver can converge to the
  // wrong basin depending on initial positions.  If the first attempt fails, we
  // perturb free points after the GS warm-up and retry — this explores different
  // basins cheaply (extra cost only on failure).
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) restoreState(initialState);

    let maxError = 0;

    // ── GS warm-up ────────────────────────────────────────────────────────
    if (canUseNR && def.constraints.length > 0) {
      const warmup = Math.min(15, iterations);
      for (let i = 0; i < warmup; i++) {
        gsPass();
        enforceArcImplicit(true);
      }
    }

    // ── Perturbation (attempts > 0) ───────────────────────────────────────
    // After warmup placed points near roughly correct positions, perturb free
    // points to bump the solver into a different basin.  Golden-angle spacing
    // gives uniform directional coverage across attempts and point indices.
    if (attempt > 0) {
      const scale = attempt * 3;
      const PHI = 2.399963; // golden angle (radians)
      for (let i = 0; i < def.points.length; i++) {
        const p = def.points[i];
        if (p.fixed) continue;
        const angle = (attempt * PHI + i * PHI * 0.5) % (2 * Math.PI);
        p.x += scale * Math.cos(angle);
        p.y += scale * Math.sin(angle);
      }
    }

    if (canUseNR && def.constraints.length > 0) {
      // ── LM-NR path ───────────────────────────────────────────────────────
      const nrResult = solveNR(def, ctx, iterations, tolerance);
      maxError = nrResult >= 0 ? nrResult : tolerance + 1;
      enforceArcImplicit(false);
    }

    if (!canUseNR || maxError > tolerance) {
      // ── GS fallback ───────────────────────────────────────────────────────
      const gsIter = Math.max(iterations * 5, 200);
      for (let i = 0; i < gsIter; i += 1) {
        maxError = 0;
        def.constraints.forEach((constraint) => {
          const constraintDef = registry.get(constraint.type);
          if (!constraintDef) return;
          maxError = Math.max(maxError, constraintDef.solve(constraint as never, ctx));
        });
        maxError = Math.max(maxError, enforceArcImplicit(true));
        if (maxError <= tolerance) break;
      }

      // ── NR retry after GS ──────────────────────────────────────────────
      if (canUseNR && maxError > tolerance) {
        const nrResult2 = solveNR(def, ctx, iterations, tolerance);
        if (nrResult2 >= 0) maxError = nrResult2;
      }
    }

    // Track best across attempts.
    if (maxError < bestError) {
      bestError = maxError;
      bestState = saveState();
    }
    if (bestError <= tolerance) break;
  }

  // Restore the best state found across all attempts.
  restoreState(bestState);
  return { maxError: bestError };
};

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

  const displays = def.constraints.map((constraint) => {
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
      isRedundant: redundantIds.has(constraint.id),
      rejectionReason: rejectionReasons?.get(constraint.id),
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
): { status: 'under' | 'fully' | 'over'; dof: number } => {
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

  // Conflict/over-constraint: solver failed to satisfy the constraints.
  if (maxError > tolerance * 5) return { status: 'over', dof };
  if (dof > 0) return { status: 'under', dof };
  if (dof < 0) return { status: 'over', dof };
  return { status: 'fully', dof: 0 };
};


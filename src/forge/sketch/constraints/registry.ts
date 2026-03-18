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

// ─── Global nonlinear least-squares solver ─────────────────────────────────────
//
// The previous implementation mixed a good global idea (LM on residuals) with a
// weak local one: each constraint also contained its own imperative “move this
// endpoint” projector and the solver still depended heavily on those local
// nudges, multi-start spreading, and repeated GS passes.  That architecture is
// fundamentally fragile because each projector only sees one constraint at a
// time, while a production sketch solver must optimise the coupled system as a
// whole.
//
// This rewrite makes the global system the primary solver:
//   1. Build a single state vector over all free geometric variables.
//   2. Evaluate a single residual vector for the entire sketch.
//   3. Add internal geometric consistency equations (e.g. arc endpoint/radius
//      consistency) directly into that residual model.
//   4. Solve with a trust-region Levenberg–Marquardt loop using:
//        - central-difference Jacobians with variable-aware step sizes,
//        - Marquardt diagonal damping,
//        - row equilibration based on Jacobian row norms,
//        - bounded steps in scaled variable space,
//        - deterministic restart seeding.
//
// Constraint-local `solve()` methods remain only as a compatibility fallback and
// as an optional warm-start projector.  They are no longer the core algorithm.
// This is the key architectural change that makes the solver meaningfully more
// powerful instead of merely “a bit less flaky”.

/** Symmetric positive-definite solve using Cholesky factorisation. */
function solveCholesky(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const value = A[i][i] - sum;
        if (value <= 0) return null;
        L[i][i] = Math.sqrt(value);
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }

  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < i; k++) sum += L[i][k] * y[k];
    y[i] = (b[i] - sum) / L[i][i];
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let k = i + 1; k < n; k++) sum += L[k][i] * x[k];
    x[i] = (y[i] - sum) / L[i][i];
  }

  return x;
}

/** Gaussian-elimination fallback for highly degenerate systems. */
function solveGaussian(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    let pivotAbs = Math.abs(aug[i][i]);
    for (let r = i + 1; r < n; r++) {
      const value = Math.abs(aug[r][i]);
      if (value > pivotAbs) {
        pivotAbs = value;
        pivotRow = r;
      }
    }
    [aug[i], aug[pivotRow]] = [aug[pivotRow], aug[i]];
    if (pivotAbs < 1e-14) continue;

    for (let r = i + 1; r < n; r++) {
      const factor = aug[r][i] / aug[i][i];
      for (let c = i; c <= n; c++) aug[r][c] -= factor * aug[i][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-14) {
      x[i] = 0;
      continue;
    }
    let value = aug[i][n];
    for (let c = i + 1; c < n; c++) value -= aug[i][c] * x[c];
    x[i] = value / aug[i][i];
  }

  return x;
}

interface SolverVariable {
  get(): number;
  set(value: number): void;
  /** Characteristic physical scale for this variable, used for finite differences and step limiting. */
  scale: number;
  /** Entity ID that owns this variable (for sparse Jacobian computation). */
  entityId: string;
}

interface ResidualEvaluation {
  values: number[];
  maxAbs: number;
}

interface LinearizedSystem {
  residual: number[];
  jacobian: number[][];
  weights: number[];
  weightedResidual: number[];
  weightedJacobian: number[][];
  maxAbsResidual: number;
  weightedCost: number;
}

/**
 * Reference length used for numerical differentiation, step limiting, and
 * deterministic restart magnitudes.  The goal is unit awareness without
 * requiring every individual constraint to declare a custom scale.
 */
function computeReferenceLength(def: ConstraintDefinition): number {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const p of def.points) {
    xs.push(p.x);
    ys.push(p.y);
  }

  for (const circle of def.circles) {
    xs.push(circle.radius, -circle.radius);
    ys.push(circle.radius, -circle.radius);
  }

  for (const arc of def.arcs ?? []) {
    xs.push(arc.radius, -arc.radius);
    ys.push(arc.radius, -arc.radius);
  }

  if (xs.length === 0 || ys.length === 0) return 1;
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  return Math.max(Math.hypot(spanX, spanY), 1);
}

function buildVariables(def: ConstraintDefinition, referenceLength: number): SolverVariable[] {
  const scale = Math.max(referenceLength, 1);
  const variables: SolverVariable[] = [];

  for (const point of def.points) {
    if (point.fixed) continue;
    variables.push(
      {
        get: () => point.x,
        set: (value: number) => { point.x = value; },
        scale,
        entityId: point.id,
      },
      {
        get: () => point.y,
        set: (value: number) => { point.y = value; },
        scale,
        entityId: point.id,
      },
    );
  }

  for (const circle of def.circles) {
    if (circle.fixedRadius) continue;
    variables.push({
      get: () => circle.radius,
      set: (value: number) => { circle.radius = Math.max(1e-9, value); },
      scale,
      entityId: circle.id,
    });
  }

  for (const arc of def.arcs ?? []) {
    variables.push({
      get: () => arc.radius,
      set: (value: number) => { arc.radius = Math.max(1e-9, value); },
      scale,
      entityId: arc.id,
    });
  }

  return variables;
}

function captureState(variables: SolverVariable[]): number[] {
  return variables.map((variable) => variable.get());
}

function applyState(variables: SolverVariable[], state: number[]): void {
  for (let i = 0; i < variables.length; i++) variables[i].set(state[i]);
}

function evaluateResiduals(def: ConstraintDefinition, ctx: SolverContext): ResidualEvaluation | null {
  const values: number[] = [];

  for (const constraint of def.constraints) {
    const constraintDef = registry.get(constraint.type);
    if (!constraintDef?.residual) return null;
    values.push(...constraintDef.residual(constraint as never, ctx));
  }

  // Internal arc consistency equations.
  // An arc owns a scalar radius variable, while its start/end points live in the
  // shared point state vector.  These equations tie the three together so the
  // global optimiser sees one coherent geometric model instead of a later
  // projection hack.
  for (const arc of def.arcs ?? []) {
    const center = ctx.points.get(arc.center);
    const start = ctx.points.get(arc.start);
    const end = ctx.points.get(arc.end);
    if (!center || !start || !end) continue;
    values.push(
      Math.hypot(start.x - center.x, start.y - center.y) - arc.radius,
      Math.hypot(end.x - center.x, end.y - center.y) - arc.radius,
    );
  }

  let maxAbs = 0;
  for (const value of values) maxAbs = Math.max(maxAbs, Math.abs(value));
  return { values, maxAbs };
}

function computeRowWeights(jacobian: number[][], referenceLength: number): number[] {
  const minNorm = 1e-9 / Math.max(referenceLength, 1);
  return jacobian.map((row) => {
    let normSq = 0;
    for (const value of row) normSq += value * value;
    const norm = Math.sqrt(normSq);
    return 1 / Math.max(norm, minNorm);
  });
}

function weightResidual(residual: number[], weights: number[]): number[] {
  return residual.map((value, i) => value * weights[i]);
}

function weightJacobian(jacobian: number[][], weights: number[]): number[][] {
  return jacobian.map((row, i) => row.map((value) => value * weights[i]));
}

function weightedCost(residual: number[]): number {
  let cost = 0;
  for (const value of residual) cost += value * value;
  return 0.5 * cost;
}

function finiteDifferenceStep(value: number, scale: number): number {
  return 1e-6 * Math.max(1, Math.abs(value), scale);
}

/**
 * Extract all entity IDs referenced by a constraint (string-valued fields
 * except `id` and `type`, plus array string elements), expanded through
 * lines → endpoints, circles → center, arcs → center/start/end.
 */
function constraintPointIds(constraint: SketchConstraint, def: ConstraintDefinition): Set<string> {
  const ids = new Set<string>();
  for (const [key, val] of Object.entries(constraint)) {
    if (key === 'id' || key === 'type') continue;
    if (typeof val === 'string') ids.add(val);
    else if (Array.isArray(val)) {
      for (const v of val) { if (typeof v === 'string') ids.add(v); }
    }
  }
  // Expand shapes → lines.
  for (const s of def.shapes ?? []) {
    if (ids.has(s.id)) {
      for (const lineId of s.lines) ids.add(lineId);
    }
  }
  // Expand lines → endpoints.
  for (const l of def.lines) {
    if (ids.has(l.id)) { ids.add(l.a); ids.add(l.b); }
  }
  // Expand circles → center.
  for (const c of def.circles) {
    if (ids.has(c.id)) ids.add(c.center);
  }
  // Expand arcs → center/start/end.
  for (const a of def.arcs ?? []) {
    if (ids.has(a.id)) { ids.add(a.center); ids.add(a.start); ids.add(a.end); }
  }
  return ids;
}

/**
 * Build a reusable sparsity structure for the Jacobian.
 * Called once per solve, maps each variable column to the residual rows it
 * can affect.  This allows the Jacobian loop to skip ~90% of constraint
 * evaluations per perturbation.
 */
function buildSparsityMap(
  def: ConstraintDefinition,
  ctx: SolverContext,
  variables: SolverVariable[],
): {
  /** Per-constraint: [startRow, count, constraintDef, constraint] */
  constraintInfo: Array<{ start: number; count: number; cdef: any; constraint: SketchConstraint }>;
  /** Per-variable: indices into constraintInfo of constraints affected */
  varToConstraints: number[][];
  /** Per-variable: indices of affected arcs (for arc consistency rows) */
  varToArcs: number[][];
  /** Starting row of arc consistency equations */
  arcRowStart: number;
  /** Total equation count */
  totalRows: number;
} {
  // Compute per-constraint residual counts and row starts.
  const constraintInfo: Array<{ start: number; count: number; cdef: any; constraint: SketchConstraint }> = [];
  let row = 0;
  for (const constraint of def.constraints) {
    const cdef = registry.get(constraint.type);
    if (!cdef?.residual) continue;
    const res = cdef.residual(constraint as never, ctx);
    constraintInfo.push({ start: row, count: res.length, cdef, constraint });
    row += res.length;
  }
  const arcRowStart = row;
  const arcs = def.arcs ?? [];
  const totalRows = row + arcs.length * 2;

  // Build constraint → entityId sets (expanded to points).
  const constraintEntities = constraintInfo.map(({ constraint }) =>
    constraintPointIds(constraint, def),
  );

  // Build arc → entityId sets.
  const arcEntities = arcs.map((a) =>
    new Set([a.id, a.center, a.start, a.end]),
  );

  // Map each variable to affected constraints and arcs.
  const varToConstraints = variables.map((v) => {
    const indices: number[] = [];
    for (let i = 0; i < constraintInfo.length; i++) {
      if (constraintEntities[i].has(v.entityId)) indices.push(i);
    }
    return indices;
  });

  const varToArcs = variables.map((v) => {
    const indices: number[] = [];
    for (let i = 0; i < arcs.length; i++) {
      if (arcEntities[i].has(v.entityId)) indices.push(i);
    }
    return indices;
  });

  return { constraintInfo, varToConstraints, varToArcs, arcRowStart, totalRows };
}

function linearizeSystem(
  def: ConstraintDefinition,
  ctx: SolverContext,
  variables: SolverVariable[],
  referenceLength: number,
  sparsity?: ReturnType<typeof buildSparsityMap>,
): LinearizedSystem | null {
  const base = evaluateResiduals(def, ctx);
  if (!base) return null;

  const parameterCount = variables.length;
  const equationCount = base.values.length;
  const jacobian: number[][] = Array.from({ length: equationCount }, () => new Array(parameterCount).fill(0));

  if (parameterCount > 0 && equationCount > 0 && sparsity) {
    // Sparse Jacobian: only evaluate affected constraints per variable.
    const arcs = def.arcs ?? [];
    for (let column = 0; column < parameterCount; column++) {
      const v = variables[column];
      const baseValue = v.get();
      const step = finiteDifferenceStep(baseValue, v.scale);
      v.set(baseValue + step);

      // Evaluate only affected constraints.
      for (const ci of sparsity.varToConstraints[column]) {
        const { start, count, cdef, constraint } = sparsity.constraintInfo[ci];
        const res = cdef.residual(constraint as never, ctx);
        for (let r = 0; r < count; r++) {
          jacobian[start + r][column] = (res[r] - base.values[start + r]) / step;
        }
      }

      // Evaluate only affected arc consistency equations.
      for (const ai of sparsity.varToArcs[column]) {
        const arc = arcs[ai];
        const center = ctx.points.get(arc.center)!;
        const start = ctx.points.get(arc.start)!;
        const end = ctx.points.get(arc.end)!;
        const r0 = sparsity.arcRowStart + ai * 2;
        const res0 = Math.hypot(start.x - center.x, start.y - center.y) - arc.radius;
        const res1 = Math.hypot(end.x - center.x, end.y - center.y) - arc.radius;
        jacobian[r0][column] = (res0 - base.values[r0]) / step;
        jacobian[r0 + 1][column] = (res1 - base.values[r0 + 1]) / step;
      }

      v.set(baseValue); // restore
    }
  } else if (parameterCount > 0 && equationCount > 0) {
    // Dense fallback.
    for (let column = 0; column < parameterCount; column++) {
      const v = variables[column];
      const baseValue = v.get();
      const step = finiteDifferenceStep(baseValue, v.scale);
      v.set(baseValue + step);
      const plusEval = evaluateResiduals(def, ctx);
      v.set(baseValue);
      if (!plusEval) return null;
      for (let row = 0; row < equationCount; row++) {
        jacobian[row][column] = (plusEval.values[row] - base.values[row]) / step;
      }
    }
  }

  const weights = computeRowWeights(jacobian, referenceLength);
  const weightedResidual = weightResidual(base.values, weights);
  const weightedJacobian = weightJacobian(jacobian, weights);

  return {
    residual: base.values,
    jacobian,
    weights,
    weightedResidual,
    weightedJacobian,
    maxAbsResidual: base.maxAbs,
    weightedCost: weightedCost(weightedResidual),
  };
}

function solveLevenbergMarquardtStep(
  weightedJacobian: number[][],
  weightedResidual: number[],
  lambda: number,
): { dx: number[]; predictedReduction: number } | null {
  const equationCount = weightedJacobian.length;
  const variableCount = equationCount > 0 ? weightedJacobian[0].length : 0;
  if (variableCount === 0) return { dx: [], predictedReduction: 0 };

  const jtJ: number[][] = Array.from({ length: variableCount }, () => new Array(variableCount).fill(0));
  const jtR: number[] = new Array(variableCount).fill(0);

  for (let row = 0; row < equationCount; row++) {
    for (let i = 0; i < variableCount; i++) {
      const ji = weightedJacobian[row][i];
      jtR[i] += ji * weightedResidual[row];
      for (let j = 0; j <= i; j++) jtJ[i][j] += ji * weightedJacobian[row][j];
    }
  }

  for (let i = 0; i < variableCount; i++) {
    for (let j = 0; j < i; j++) jtJ[j][i] = jtJ[i][j];
  }

  const A = jtJ.map((row, i) => [...row]);
  for (let i = 0; i < variableCount; i++) A[i][i] += lambda * (jtJ[i][i] + 1e-9);

  const rhs = jtR.map((value) => -value);
  const dx = solveCholesky(A, rhs) ?? solveGaussian(A, rhs);

  let predictedReduction = 0;
  for (let i = 0; i < variableCount; i++) {
    let jtJdx = 0;
    for (let j = 0; j < variableCount; j++) jtJdx += jtJ[i][j] * dx[j];
    predictedReduction += dx[i] * (-jtR[i] - 0.5 * jtJdx);
  }

  return { dx, predictedReduction };
}

function scaledStepNorm(dx: number[], variables: SolverVariable[]): number {
  let sum = 0;
  for (let i = 0; i < dx.length; i++) {
    const s = dx[i] / Math.max(variables[i].scale, 1e-9);
    sum += s * s;
  }
  return Math.sqrt(sum);
}

function limitStep(dx: number[], variables: SolverVariable[], maxScaledNorm: number): number[] {
  const norm = scaledStepNorm(dx, variables);
  if (norm <= maxScaledNorm || norm < 1e-12) return dx;
  const scale = maxScaledNorm / norm;
  return dx.map((value) => value * scale);
}

function runProjectorWarmStart(def: ConstraintDefinition, ctx: SolverContext, iterations: number): void {
  if (iterations <= 0) return;
  for (let iter = 0; iter < iterations; iter++) {
    for (const constraint of def.constraints) {
      const constraintDef = registry.get(constraint.type);
      if (!constraintDef) continue;
      constraintDef.solve(constraint as never, ctx);
    }
  }
}

function seedRestart(
  def: ConstraintDefinition,
  variables: SolverVariable[],
  initialState: number[],
  attempt: number,
  referenceLength: number,
): void {
  applyState(variables, initialState);
  if (attempt === 0) return;

  const radius = referenceLength * (0.15 + 0.2 * Math.min(attempt, 4));
  const goldenAngle = 2.399963229728653;
  let pointIndex = 0;

  for (const point of def.points) {
    if (point.fixed) continue;
    const angle = (attempt * 1.37 + pointIndex) * goldenAngle;
    const localRadius = radius * (1 + (pointIndex % 4) * 0.15);
    point.x += localRadius * Math.cos(angle);
    point.y += localRadius * Math.sin(angle);
    pointIndex++;
  }

  let circleIndex = 0;
  for (const circle of def.circles) {
    if (circle.fixedRadius) continue;
    const scale = 1 + 0.1 * ((attempt + circleIndex) % 3 - 1);
    circle.radius = Math.max(1e-6, circle.radius * scale);
    circleIndex++;
  }

  let arcIndex = 0;
  for (const arc of def.arcs ?? []) {
    const scale = 1 + 0.1 * ((attempt + arcIndex + 1) % 3 - 1);
    arc.radius = Math.max(1e-6, arc.radius * scale);
    arcIndex++;
  }
}

function solveGlobalSystem(
  def: ConstraintDefinition,
  ctx: SolverContext,
  iterations: number,
  tolerance: number,
  restarts: number,
  warmStartIterations: number,
  maxScaledStep: number,
): number {
  const referenceLength = computeReferenceLength(def);
  const variables = buildVariables(def, referenceLength);

  if (variables.length === 0) {
    const evalResult = evaluateResiduals(def, ctx);
    return evalResult?.maxAbs ?? 0;
  }

  // Build sparsity map once — reused across all LM iterations.
  const sparsity = buildSparsityMap(def, ctx, variables);

  const initialState = captureState(variables);
  let bestState = [...initialState];
  let bestError = Infinity;

  for (let attempt = 0; attempt < restarts; attempt++) {
    seedRestart(def, variables, initialState, attempt, referenceLength);
    // Only warm-start on the first attempt. Subsequent restarts rely on their
    // perturbation seeds — running projectors would overwrite them.
    if (attempt === 0) {
      runProjectorWarmStart(def, ctx, warmStartIterations);
    }

    let lambda = 1e-3;
    let nu = 2;
    let linearized = linearizeSystem(def, ctx, variables, referenceLength, sparsity);
    if (!linearized) return Infinity;

    for (let iter = 0; iter < iterations; iter++) {
      if (linearized.maxAbsResidual <= tolerance) break;

      const stepResult = solveLevenbergMarquardtStep(
        linearized.weightedJacobian,
        linearized.weightedResidual,
        lambda,
      );
      if (!stepResult) break;

      const state = captureState(variables);
      let { dx, predictedReduction } = stepResult;
      dx = limitStep(dx, variables, maxScaledStep);
      predictedReduction *= Math.min(1, maxScaledStep / Math.max(scaledStepNorm(stepResult.dx, variables), maxScaledStep));

      let accepted = false;
      let localNu = nu;
      let localLambda = lambda;

      for (let inner = 0; inner < 12; inner++) {
        const trialState = state.map((value, index) => value + dx[index]);
        applyState(variables, trialState);

        const trial = linearizeSystem(def, ctx, variables, referenceLength, sparsity);
        if (!trial) {
          applyState(variables, state);
          break;
        }

        const actualReduction = linearized.weightedCost - trial.weightedCost;
        const rho = predictedReduction > 0 ? actualReduction / predictedReduction : 0;

        if (actualReduction > 0) {
          accepted = true;
          linearized = trial;
          lambda = rho > 0
            ? localLambda * Math.max(1 / 3, 1 - Math.pow(2 * rho - 1, 3))
            : localLambda;
          nu = 2;
          break;
        }

        applyState(variables, state);
        localLambda *= localNu;
        localNu *= 2;
        const retry = solveLevenbergMarquardtStep(
          linearized.weightedJacobian,
          linearized.weightedResidual,
          localLambda,
        );
        if (!retry) break;
        dx = limitStep(retry.dx, variables, maxScaledStep);
        predictedReduction = retry.predictedReduction;
      }

      if (!accepted) break;
    }

    const finalEval = evaluateResiduals(def, ctx);
    const finalError = finalEval?.maxAbs ?? Infinity;
    if (finalError < bestError) {
      bestError = finalError;
      bestState = captureState(variables);
    }
    if (bestError <= tolerance) break;
  }

  // GS escape: if LM converged to a local minimum (not fully solved),
  // restore the best state, run GS projectors to nudge geometry, then
  // do one more LM pass.  This hybrid breaks through plateaus that neither
  // pure LM nor pure GS can handle alone.
  if (bestError > tolerance) {
    for (let gsRound = 0; gsRound < 3; gsRound++) {
      applyState(variables, bestState);
      runProjectorWarmStart(def, ctx, Math.max(warmStartIterations * 4, 30));

      let lambda = 1e-3;
      let nu = 2;
      let linearized = linearizeSystem(def, ctx, variables, referenceLength, sparsity);
      if (!linearized) break;

      for (let iter = 0; iter < iterations; iter++) {
        if (linearized.maxAbsResidual <= tolerance) break;
        const stepResult = solveLevenbergMarquardtStep(
          linearized.weightedJacobian,
          linearized.weightedResidual,
          lambda,
        );
        if (!stepResult) break;
        const state = captureState(variables);
        let { dx, predictedReduction } = stepResult;
        dx = limitStep(dx, variables, maxScaledStep);
        predictedReduction *= Math.min(1, maxScaledStep / Math.max(scaledStepNorm(stepResult.dx, variables), maxScaledStep));
        let accepted = false;
        let localNu = nu;
        let localLambda = lambda;
        for (let inner = 0; inner < 12; inner++) {
          const trialState = state.map((value, index) => value + dx[index]);
          applyState(variables, trialState);
          const trial = linearizeSystem(def, ctx, variables, referenceLength, sparsity);
          if (!trial) { applyState(variables, state); break; }
          const actualReduction = linearized.weightedCost - trial.weightedCost;
          const rho = predictedReduction > 0 ? actualReduction / predictedReduction : 0;
          if (actualReduction > 0) {
            accepted = true;
            linearized = trial;
            lambda = rho > 0
              ? localLambda * Math.max(1 / 3, 1 - Math.pow(2 * rho - 1, 3))
              : localLambda;
            nu = 2;
            break;
          }
          applyState(variables, state);
          localLambda *= localNu;
          localNu *= 2;
          const retry = solveLevenbergMarquardtStep(
            linearized.weightedJacobian,
            linearized.weightedResidual,
            localLambda,
          );
          if (!retry) break;
          dx = limitStep(retry.dx, variables, maxScaledStep);
          predictedReduction = retry.predictedReduction;
        }
        if (!accepted) break;
      }

      const gsEval = evaluateResiduals(def, ctx);
      const gsError = gsEval?.maxAbs ?? Infinity;
      if (gsError < bestError) {
        bestError = gsError;
        bestState = captureState(variables);
      }
      if (bestError <= tolerance) break;
    }
  }

  applyState(variables, bestState);
  return bestError;
}

function legacyGaussSeidelSolve(
  def: ConstraintDefinition,
  ctx: SolverContext,
  iterations: number,
): number {
  let maxError = 0;
  const gsIterations = Math.max(iterations * 5, 200);

  for (let iter = 0; iter < gsIterations; iter++) {
    maxError = 0;
    for (const constraint of def.constraints) {
      const constraintDef = registry.get(constraint.type);
      if (!constraintDef) continue;
      maxError = Math.max(maxError, constraintDef.solve(constraint as never, ctx));
    }
    if (maxError <= ctx.tolerance) break;
  }

  return maxError;
}

// ─── Solver ────────────────────────────────────────────────────────────────────

export const DEFAULT_TOLERANCE = 1e-3;

export const solveConstraints = (
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number } => {
  const iterations = options.iterations ?? 80;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const restarts = options.restarts ?? 6;
  const warmStartIterations = options.warmStartIterations ?? 6;
  const maxScaledStep = options.maxScaledStep ?? 2.5;

  const points = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = new Map(def.lines.map((l) => [l.id, l] as const));
  const circles = new Map(def.circles.map((c) => [c.id, c] as const));
  const arcs = new Map((def.arcs ?? []).map((a) => [a.id, a] as const));
  const shapes = new Map((def.shapes ?? []).map((s) => [s.id, s] as const));

  const movePoint = (pt: SketchPoint, dx: number, dy: number): boolean => {
    if (pt.fixed) return false;
    pt.x += dx;
    pt.y += dy;
    return true;
  };

  const ctx: SolverContext = {
    points,
    lines,
    circles,
    arcs,
    shapes,
    tolerance,
    movePoint,
  };

  for (const constraint of def.constraints) {
    const constraintDef = registry.get(constraint.type);
    constraintDef?.presolve?.(constraint as never, ctx);
  }

  const hasFullResidualModel = def.constraints.every((constraint) => {
    const constraintDef = registry.get(constraint.type);
    return constraintDef?.residual != null;
  });

  const maxError = hasFullResidualModel
    ? solveGlobalSystem(def, ctx, iterations, tolerance, restarts, warmStartIterations, maxScaledStep)
    : legacyGaussSeidelSolve(def, ctx, iterations);

  return { maxError };
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

    // Build annotations if the constraint defines them, otherwise fall back to text.
    const value = getConstraintValue(constraint);
    const label = buildLabel(constraint.type);
    const isDimension = isDimensionConstraint(constraint.type);
    let annotations: import('./types').AnnotationElement[] = [];
    if (constraintDef?.displayAnnotations) {
      annotations = constraintDef.displayAnnotations(constraint as never, ctx);
    }
    if (annotations.length === 0) {
      // Fallback: legacy text label at the computed position.
      const text = isDimension && value !== undefined ? `${label}${value}` : label;
      annotations = [{ kind: 'text', position, text }];
    }

    return {
      id: constraint.id,
      type: constraint.type,
      label,
      position,
      value,
      isDimension,
      isConflicting: conflictingIds.has(constraint.id),
      isRedundant: redundantIds.has(constraint.id),
      rejectionReason: rejectionReasons?.get(constraint.id),
      entityIds,
      residual,
      annotations,
    };
  });

  // ─── Force-directed label placement ───────────────────────────────────────
  // Replaces naive point-based pairwise repulsion with a geometry-aware,
  // text-width-aware force-directed layout.

  const FONT_SIZE = 2;
  const CHAR_WIDTH = FONT_SIZE * 0.6;
  const TEXT_HEIGHT = FONT_SIZE * 1.2;
  const LABEL_PAD = 1.0; // extra padding around text bbox

  // Compute text bounding box dimensions for each label.
  // Dimension constraints render as "symbol + value" (e.g., "⟨22"), others just the symbol.
  const labelTexts = displays.map(
    (d) => d.isDimension && d.value !== undefined ? `${d.label}${d.value}` : d.label,
  );
  const halfWidths = labelTexts.map((t) => (t.length * CHAR_WIDTH) / 2 + LABEL_PAD);
  const halfHeight = TEXT_HEIGHT / 2 + LABEL_PAD;

  // Collect edge segments from the definition's lines (for geometry avoidance).
  const edgeSegs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const line of def.lines) {
    if (line.construction) continue;
    const a = ctx.points.get(line.a);
    const b = ctx.points.get(line.b);
    if (a && b) edgeSegs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  // Compute entity centroid for each label (tether anchor).
  const anchors: ([number, number] | null)[] = displays.map((d) => {
    const pts: [number, number][] = [];
    for (const eid of d.entityIds) {
      const pt = ctx.points.get(eid);
      if (pt) { pts.push([pt.x, pt.y]); continue; }
      const ln = ctx.lines.get(eid);
      if (ln) {
        const a = ctx.points.get(ln.a);
        const b = ctx.points.get(ln.b);
        if (a && b) pts.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
        continue;
      }
      const ci = ctx.circles.get(eid);
      if (ci) {
        const c = ctx.points.get(ci.center);
        if (c) pts.push([c.x, c.y]);
      }
    }
    if (pts.length === 0) return null;
    return [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ] as [number, number];
  });

  const pos = displays.map((d) => [d.position[0], d.position[1]] as [number, number]);
  const n = pos.length;

  // Force simulation parameters.
  const MAX_ITERS = 80;
  const DAMPING = 0.4;
  const LABEL_REPULSION = 2.0;   // strength of label-label repulsion
  const EDGE_REPULSION = 1.0;    // strength of edge repulsion
  const EDGE_INFLUENCE = 4.0;    // max distance at which edges repel
  const TETHER_STRENGTH = 0.12;  // spring pull back toward entity (stronger — symbols are small)
  const MAX_TETHER_DIST = 12;    // tighter leash — compact symbols stay near entities

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let maxForce = 0;
    const forces: [number, number][] = pos.map(() => [0, 0]);

    // 1. Label-label repulsion (bbox-aware).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const overlapX = (halfWidths[i] + halfWidths[j]) - Math.abs(pos[j][0] - pos[i][0]);
        const overlapY = (halfHeight + halfHeight) - Math.abs(pos[j][1] - pos[i][1]);
        if (overlapX > 0 && overlapY > 0) {
          // Labels overlap — push apart along the axis of least overlap.
          let dx = pos[j][0] - pos[i][0];
          let dy = pos[j][1] - pos[i][1];
          const d = Math.hypot(dx, dy);
          if (d < 0.01) {
            // Exact overlap — use index-based angle to break symmetry.
            const a = (i * Math.PI * 2) / Math.max(n, 2);
            dx = Math.cos(a); dy = Math.sin(a);
          } else {
            dx /= d; dy /= d;
          }
          const push = Math.min(overlapX, overlapY) * LABEL_REPULSION;
          forces[i][0] -= dx * push; forces[i][1] -= dy * push;
          forces[j][0] += dx * push; forces[j][1] += dy * push;
        }
      }
    }

    // 2. Edge repulsion — push labels away from nearby edge segments.
    //    Uses label bounding box extent to determine effective repulsion radius.
    for (let i = 0; i < n; i++) {
      const hw = halfWidths[i];
      const hh = halfHeight;
      for (const seg of edgeSegs) {
        // Find closest point on segment to label center.
        const ex = seg.x2 - seg.x1;
        const ey = seg.y2 - seg.y1;
        const len2 = ex * ex + ey * ey;
        let t = 0;
        if (len2 > 1e-9) {
          t = Math.max(0, Math.min(1, ((pos[i][0] - seg.x1) * ex + (pos[i][1] - seg.y1) * ey) / len2));
        }
        const cx = seg.x1 + t * ex;
        const cy = seg.y1 + t * ey;
        let dx = pos[i][0] - cx;
        let dy = pos[i][1] - cy;
        const d = Math.hypot(dx, dy);
        // Scale influence by label size — larger labels need more clearance.
        const effectiveInfluence = EDGE_INFLUENCE + Math.max(hw, hh) * 0.5;
        if (d < effectiveInfluence && d > 0.01) {
          const strength = EDGE_REPULSION * (1 - d / effectiveInfluence);
          dx /= d; dy /= d;
          forces[i][0] += dx * strength;
          forces[i][1] += dy * strength;
        }
      }
    }

    // 3. Entity tether — spring force pulling label toward its anchor.
    for (let i = 0; i < n; i++) {
      const anchor = anchors[i];
      if (!anchor) continue;
      const dx = anchor[0] - pos[i][0];
      const dy = anchor[1] - pos[i][1];
      const d = Math.hypot(dx, dy);
      if (d > 0.1) {
        forces[i][0] += dx * TETHER_STRENGTH;
        forces[i][1] += dy * TETHER_STRENGTH;
      }
    }

    // Apply forces with damping.
    for (let i = 0; i < n; i++) {
      const fx = forces[i][0] * DAMPING;
      const fy = forces[i][1] * DAMPING;
      pos[i][0] += fx;
      pos[i][1] += fy;
      maxForce = Math.max(maxForce, Math.abs(fx), Math.abs(fy));
    }

    // Clamp max distance from anchor.
    for (let i = 0; i < n; i++) {
      const anchor = anchors[i];
      if (!anchor) continue;
      const dx = pos[i][0] - anchor[0];
      const dy = pos[i][1] - anchor[1];
      const d = Math.hypot(dx, dy);
      if (d > MAX_TETHER_DIST) {
        pos[i][0] = anchor[0] + (dx / d) * MAX_TETHER_DIST;
        pos[i][1] = anchor[1] + (dy / d) * MAX_TETHER_DIST;
      }
    }

    // Early exit when forces are negligible.
    if (maxForce < 0.01) break;
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
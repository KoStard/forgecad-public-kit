/**
 * 3D Constraint Solver
 *
 * Levenberg-Marquardt solver for rigid body assembly constraints.
 * Each free body has 6 variables: [tx, ty, tz, rx, ry, rz] (axis-angle).
 *
 * Architecture mirrors the proven 2D sketch solver:
 * - Central-difference numerical Jacobians
 * - Cholesky factorization with Gaussian fallback
 * - Trust-region step limiting
 * - Multi-start with deterministic perturbations
 */

import type { Vec3 } from '../transform';
import type {
  RigidBody,
  Constraint3D,
  Constraint3DDef,
  Solver3DContext,
  Solve3DOptions,
  Solve3DResult,
  Solve3DStatus,
} from './types';
import { transformPoint, transformDir, normalize3 } from './rodrigues';

// ─── Constraint registry ────────────────────────────────────────────────────

import { flushDef } from './defs/flush';
import { alignDef } from './defs/align';
import { parallelDef } from './defs/parallel';
import { concentricDef } from './defs/concentric';
import { faceDistanceDef } from './defs/faceDistance';
import { pointCoincidentDef } from './defs/pointCoincident';
import { pointOnFaceDef } from './defs/pointOnFace';
import { pointOnAxisDef } from './defs/pointOnAxis';
import { angleDef } from './defs/angle';
import { fixedDef } from './defs/fixed';
import { axisParallelDef } from './defs/axisParallel';

const constraintDefs = new Map<string, Constraint3DDef>([
  ['flush', flushDef],
  ['align', alignDef],
  ['parallel', parallelDef],
  ['faceDistance', faceDistanceDef],
  ['concentric', concentricDef],
  ['axisParallel', axisParallelDef],
  ['pointCoincident', pointCoincidentDef],
  ['pointOnFace', pointOnFaceDef],
  ['pointOnAxis', pointOnAxisDef],
  ['angle', angleDef],
  ['fixed', fixedDef],
]);

// ─── Variable management ────────────────────────────────────────────────────

interface Variable {
  bodyId: string;
  component: number; // 0-5: tx,ty,tz,rx,ry,rz
  get: () => number;
  set: (v: number) => void;
  scale: number; // for step normalization
}

function buildVariables(bodies: Map<string, RigidBody>): Variable[] {
  const vars: Variable[] = [];
  for (const [id, body] of bodies) {
    if (body.grounded) continue;
    for (let c = 0; c < 6; c++) {
      const isRotation = c >= 3;
      const arr = isRotation ? body.rotation : body.position;
      const idx = isRotation ? c - 3 : c;
      vars.push({
        bodyId: id,
        component: c,
        get: () => arr[idx],
        set: (v: number) => { arr[idx] = v; },
        scale: isRotation ? 1.0 : computePositionScale(body),
      });
    }
  }
  return vars;
}

function computePositionScale(body: RigidBody): number {
  // Use face center distances as reference scale
  let maxDist = 1;
  for (const face of body.faces.values()) {
    const d = Math.hypot(face.center[0], face.center[1], face.center[2]);
    if (d > maxDist) maxDist = d;
  }
  return Math.max(1, maxDist);
}

// ─── Solver context creation ────────────────────────────────────────────────

function createContext(bodies: Map<string, RigidBody>): Solver3DContext {
  return {
    bodies,
    toWorld(bodyId: string, point: Vec3): Vec3 {
      const body = bodies.get(bodyId);
      if (!body) throw new Error(`Unknown body: ${bodyId}`);
      return transformPoint(body.rotation, body.position, point);
    },
    toWorldDir(bodyId: string, dir: Vec3): Vec3 {
      const body = bodies.get(bodyId);
      if (!body) throw new Error(`Unknown body: ${bodyId}`);
      return normalize3(transformDir(body.rotation, dir));
    },
    worldFace(bodyId: string, faceName: string): { normal: Vec3; center: Vec3 } {
      const body = bodies.get(bodyId);
      if (!body) throw new Error(`Unknown body: ${bodyId}`);
      const face = body.faces.get(faceName);
      if (!face) throw new Error(`Unknown face "${faceName}" on body "${bodyId}"`);
      return {
        normal: normalize3(transformDir(body.rotation, face.normal)),
        center: transformPoint(body.rotation, body.position, face.center),
      };
    },
    worldAxis(bodyId: string, axisName: string): { origin: Vec3; direction: Vec3 } {
      const body = bodies.get(bodyId);
      if (!body) throw new Error(`Unknown body: ${bodyId}`);
      const axis = body.axes.get(axisName);
      if (!axis) throw new Error(`Unknown axis "${axisName}" on body "${bodyId}"`);
      return {
        origin: transformPoint(body.rotation, body.position, axis.origin),
        direction: normalize3(transformDir(body.rotation, axis.direction)),
      };
    },
    worldPoint(bodyId: string, pointName: string): Vec3 {
      const body = bodies.get(bodyId);
      if (!body) throw new Error(`Unknown body: ${bodyId}`);
      const pt = body.points.get(pointName);
      if (!pt) throw new Error(`Unknown point "${pointName}" on body "${bodyId}"`);
      return transformPoint(body.rotation, body.position, pt.position);
    },
  };
}

// ─── Residual evaluation ────────────────────────────────────────────────────

function evaluateResiduals(
  constraints: Constraint3D[],
  ctx: Solver3DContext,
): { residuals: number[]; maxAbs: number } {
  const residuals: number[] = [];
  let maxAbs = 0;
  for (const c of constraints) {
    const def = constraintDefs.get(c.type);
    if (!def || def.equations === 0) continue;
    const r = def.residual(c, ctx);
    for (const v of r) {
      residuals.push(v);
      const abs = Math.abs(v);
      if (abs > maxAbs) maxAbs = abs;
    }
  }
  return { residuals, maxAbs };
}

// ─── Jacobian (central finite differences) ──────────────────────────────────

function computeJacobian(
  constraints: Constraint3D[],
  ctx: Solver3DContext,
  variables: Variable[],
): { J: number[][]; residuals: number[]; maxAbs: number } {
  const nVars = variables.length;

  // Evaluate at current point
  const { residuals, maxAbs } = evaluateResiduals(constraints, ctx);
  const nRes = residuals.length;

  const J: number[][] = Array.from({ length: nRes }, () => new Array(nVars).fill(0));

  for (let j = 0; j < nVars; j++) {
    const v = variables[j];
    const val = v.get();
    const h = 1e-7 * Math.max(1, Math.abs(val), v.scale);

    // Forward
    v.set(val + h);
    const rPlus = evaluateResiduals(constraints, ctx).residuals;

    // Backward
    v.set(val - h);
    const rMinus = evaluateResiduals(constraints, ctx).residuals;

    // Restore
    v.set(val);

    // Central difference
    const inv2h = 1 / (2 * h);
    for (let i = 0; i < nRes; i++) {
      J[i][j] = (rPlus[i] - rMinus[i]) * inv2h;
    }
  }

  return { J, residuals, maxAbs };
}

// ─── Cholesky solve for (J^T J + λI) dx = -J^T r ───────────────────────────

function solveNormalEquations(
  J: number[][],
  r: number[],
  lambda: number,
  nVars: number,
): number[] | null {
  const nRes = r.length;

  // Build J^T J + λI
  const JtJ: number[][] = Array.from({ length: nVars }, () => new Array(nVars).fill(0));
  const Jtr: number[] = new Array(nVars).fill(0);

  for (let i = 0; i < nRes; i++) {
    for (let j = 0; j < nVars; j++) {
      Jtr[j] -= J[i][j] * r[i];
      for (let k = j; k < nVars; k++) {
        JtJ[j][k] += J[i][j] * J[i][k];
      }
    }
  }

  // Symmetrize + add damping
  for (let j = 0; j < nVars; j++) {
    JtJ[j][j] += lambda * (1 + JtJ[j][j]); // Marquardt diagonal
    for (let k = j + 1; k < nVars; k++) {
      JtJ[k][j] = JtJ[j][k];
    }
  }

  // Cholesky factorization
  const L: number[][] = Array.from({ length: nVars }, () => new Array(nVars).fill(0));
  for (let i = 0; i < nVars; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const val = JtJ[i][i] - sum;
        if (val <= 0) return null; // Not positive definite
        L[i][j] = Math.sqrt(val);
      } else {
        L[i][j] = (JtJ[i][j] - sum) / L[j][j];
      }
    }
  }

  // Forward substitution: L y = Jtr
  const y = new Array(nVars).fill(0);
  for (let i = 0; i < nVars; i++) {
    let sum = 0;
    for (let k = 0; k < i; k++) sum += L[i][k] * y[k];
    y[i] = (Jtr[i] - sum) / L[i][i];
  }

  // Back substitution: L^T dx = y
  const dx = new Array(nVars).fill(0);
  for (let i = nVars - 1; i >= 0; i--) {
    let sum = 0;
    for (let k = i + 1; k < nVars; k++) sum += L[k][i] * dx[k];
    dx[i] = (y[i] - sum) / L[i][i];
  }

  return dx;
}

// ─── Step limiting ──────────────────────────────────────────────────────────

function limitStep(dx: number[], variables: Variable[], maxScaledStep: number): number[] {
  let scaledNorm = 0;
  for (let i = 0; i < dx.length; i++) {
    const s = dx[i] / Math.max(1, variables[i].scale);
    scaledNorm += s * s;
  }
  scaledNorm = Math.sqrt(scaledNorm);

  if (scaledNorm > maxScaledStep) {
    const factor = maxScaledStep / scaledNorm;
    return dx.map(d => d * factor);
  }
  return dx;
}

// ─── State capture/restore ──────────────────────────────────────────────────

function captureState(variables: Variable[]): number[] {
  return variables.map(v => v.get());
}

function applyState(variables: Variable[], state: number[]): void {
  for (let i = 0; i < variables.length; i++) {
    variables[i].set(state[i]);
  }
}

// ─── Golden-angle perturbation seeding ──────────────────────────────────────

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function seedRestart(
  variables: Variable[],
  initialState: number[],
  attempt: number,
  scale: number,
): void {
  if (attempt === 0) {
    applyState(variables, initialState);
    return;
  }

  const angle = attempt * GOLDEN_ANGLE;
  const radius = scale * 0.1 * Math.sqrt(attempt);

  for (let i = 0; i < variables.length; i++) {
    const phase = angle + i * GOLDEN_ANGLE;
    const perturbation = radius * Math.sin(phase) / Math.max(1, variables[i].scale);
    variables[i].set(initialState[i] + perturbation);
  }
}

// ─── Main solver ────────────────────────────────────────────────────────────

export function solve3D(
  bodies: Map<string, RigidBody>,
  constraints: Constraint3D[],
  options: Solve3DOptions = {},
): Solve3DResult {
  const maxIterations = options.iterations ?? 100;
  const tolerance = options.tolerance ?? 1e-4;
  const restarts = options.restarts ?? 4;
  const initialLambda = options.initialLambda ?? 1e-3;

  // Count equations and DOF
  let totalEquations = 0;
  for (const c of constraints) {
    const def = constraintDefs.get(c.type);
    if (def) totalEquations += def.equations;
  }

  let freeBodies = 0;
  for (const body of bodies.values()) {
    if (!body.grounded) freeBodies++;
  }

  const totalDof = 6 * freeBodies;
  const netDof = totalDof - totalEquations;

  const variables = buildVariables(bodies);
  const ctx = createContext(bodies);

  if (variables.length === 0) {
    const { maxAbs } = evaluateResiduals(constraints, ctx);
    return {
      status: classifyStatus(netDof, maxAbs, tolerance),
      dof: netDof,
      maxError: maxAbs,
      transforms: extractTransforms(bodies),
      iterations: 0,
      converged: maxAbs <= tolerance,
    };
  }

  // Reference length for perturbation scale
  let refLength = 1;
  for (const body of bodies.values()) {
    for (const face of body.faces.values()) {
      const d = Math.hypot(face.center[0], face.center[1], face.center[2]);
      if (d > refLength) refLength = d;
    }
  }

  const initialState = captureState(variables);
  let bestState = [...initialState];
  let bestError = Infinity;
  let totalIters = 0;

  for (let attempt = 0; attempt < restarts; attempt++) {
    seedRestart(variables, initialState, attempt, refLength);

    let lambda = initialLambda;
    let nu = 2;

    for (let iter = 0; iter < maxIterations; iter++) {
      totalIters++;

      const { J, residuals, maxAbs } = computeJacobian(constraints, ctx, variables);

      if (maxAbs < bestError) {
        bestError = maxAbs;
        bestState = captureState(variables);
      }

      if (maxAbs <= tolerance) break;

      const dx = solveNormalEquations(J, residuals, lambda, variables.length);
      if (!dx) {
        lambda *= nu;
        nu *= 2;
        continue;
      }

      const limited = limitStep(dx, variables, 3.0);
      const state = captureState(variables);

      // Apply step
      for (let i = 0; i < variables.length; i++) {
        variables[i].set(state[i] + limited[i]);
      }

      const trial = evaluateResiduals(constraints, ctx);
      const oldCost = residuals.reduce((s, v) => s + v * v, 0);
      const newCost = trial.residuals.reduce((s, v) => s + v * v, 0);

      if (newCost < oldCost) {
        // Accept step
        lambda = Math.max(lambda / 3, 1e-10);
        nu = 2;
      } else {
        // Reject step, increase damping
        applyState(variables, state);
        lambda *= nu;
        nu *= 2;
      }
    }

    if (bestError <= tolerance) break;
  }

  // Restore best state
  applyState(variables, bestState);

  return {
    status: classifyStatus(netDof, bestError, tolerance),
    dof: netDof,
    maxError: bestError,
    transforms: extractTransforms(bodies),
    iterations: totalIters,
    converged: bestError <= tolerance,
  };
}

function classifyStatus(dof: number, maxError: number, tolerance: number): Solve3DStatus {
  const converged = maxError <= tolerance;
  if (!converged) return 'conflicting';
  if (dof > 0) return 'under';
  if (dof === 0) return 'fully';
  return 'over-redundant';
}

function extractTransforms(bodies: Map<string, RigidBody>): Map<string, { position: Vec3; rotation: Vec3 }> {
  const result = new Map<string, { position: Vec3; rotation: Vec3 }>();
  for (const [id, body] of bodies) {
    result.set(id, {
      position: [...body.position] as Vec3,
      rotation: [...body.rotation] as Vec3,
    });
  }
  return result;
}

// ─── Exports for testing ────────────────────────────────────────────────────

export { constraintDefs, createContext, evaluateResiduals };

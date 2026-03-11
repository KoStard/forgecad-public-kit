import type { ProfileCompilePlan, ShapeCompilePlan } from './compilePlan';
import type { BrepProfilePlan, BrepShapePlan } from './brepPlan';
import {
  compilerDiagnostic,
  compilerFailure,
  compilerSuccess,
  type CompileLoweringResult,
} from './compilerDiagnostics';

function segmentedProfileDiagnostic(kind: string, path: string) {
  return compilerDiagnostic(
    'exact-brep',
    `exact-brep-segmented-${kind}`,
    path,
    `Exact BREP lowering does not support segmented ${kind} geometry at ${path}; use the analytic form or faceted fallback.`,
  );
}

function segmentedShapeDiagnostic(kind: string, path: string) {
  return compilerDiagnostic(
    'exact-brep',
    `exact-brep-segmented-${kind}`,
    path,
    `Exact BREP lowering does not support segmented ${kind} solids at ${path}; use the analytic form or faceted fallback.`,
  );
}

function missingCompilePlanDiagnostic(path: string) {
  return compilerDiagnostic(
    'exact-brep',
    'missing-compile-plan',
    path,
    `Exact BREP lowering cannot proceed because Forge compile intent is missing at ${path}.`,
  );
}

function lowerProfileCompilePlanToBrepResultAtPath(
  plan: ProfileCompilePlan | null,
  path: string,
): CompileLoweringResult<BrepProfilePlan> {
  if (!plan) return compilerFailure(missingCompilePlanDiagnostic(path));

  switch (plan.kind) {
    case 'rect':
      return compilerSuccess({
        kind: 'rect',
        width: plan.width,
        height: plan.height,
        center: plan.center,
        transforms: [...plan.transforms],
      });
    case 'roundedRect':
      return compilerSuccess({
        kind: 'roundedRect',
        width: plan.width,
        height: plan.height,
        radius: plan.radius,
        center: plan.center,
        transforms: [...plan.transforms],
      });
    case 'circle':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedProfileDiagnostic('circle profiles', path));
      }
      return compilerSuccess({
        kind: 'circle',
        radius: plan.radius,
        transforms: [...plan.transforms],
      });
    case 'polygon':
      return compilerSuccess({
        kind: 'polygon',
        points: plan.points.map(([x, y]) => [x, y]),
        transforms: [...plan.transforms],
      });
    case 'boolean': {
      const profiles: BrepProfilePlan[] = [];
      const diagnostics = [];
      for (let index = 0; index < plan.profiles.length; index += 1) {
        const lowered = lowerProfileCompilePlanToBrepResultAtPath(plan.profiles[index], `${path}.profiles[${index}]`);
        if (!lowered.ok) {
          diagnostics.push(...lowered.diagnostics);
          continue;
        }
        diagnostics.push(...lowered.diagnostics);
        profiles.push(lowered.value);
      }
      if (profiles.length !== plan.profiles.length) {
        return compilerFailure(...diagnostics);
      }
      return compilerSuccess({
        kind: 'boolean',
        op: plan.op,
        profiles,
        transforms: [...plan.transforms],
      }, diagnostics);
    }
    case 'offset': {
      const base = lowerProfileCompilePlanToBrepResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      return compilerSuccess({
        kind: 'offset',
        base: base.value,
        delta: plan.delta,
        join: plan.join,
        transforms: [...plan.transforms],
      }, base.diagnostics);
    }
  }
}

function lowerShapeCompilePlanToBrepResultAtPath(
  plan: ShapeCompilePlan | null,
  path: string,
): CompileLoweringResult<BrepShapePlan> {
  if (!plan) return compilerFailure(missingCompilePlanDiagnostic(path));

  switch (plan.kind) {
    case 'box':
      return compilerSuccess({ kind: 'box', x: plan.x, y: plan.y, z: plan.z, center: plan.center });
    case 'cylinder':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('cylinder', path));
      }
      return compilerSuccess({
        kind: 'cylinder',
        height: plan.height,
        radius: plan.radius,
        radiusTop: plan.radiusTop,
        center: plan.center,
      });
    case 'sphere':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('sphere', path));
      }
      return compilerSuccess({ kind: 'sphere', radius: plan.radius });
    case 'extrude': {
      const profile = lowerProfileCompilePlanToBrepResultAtPath(plan.profile, `${path}.profile`);
      if (!profile.ok) return compilerFailure(...profile.diagnostics);
      return compilerSuccess({
        kind: 'extrude',
        profile: profile.value,
        height: plan.height,
        center: plan.center,
        scaleTop: plan.scaleTop ? [plan.scaleTop[0], plan.scaleTop[1]] : undefined,
      }, profile.diagnostics);
    }
    case 'revolve': {
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('revolve', path));
      }
      const profile = lowerProfileCompilePlanToBrepResultAtPath(plan.profile, `${path}.profile`);
      if (!profile.ok) return compilerFailure(...profile.diagnostics);
      return compilerSuccess({
        kind: 'revolve',
        profile: profile.value,
        degrees: plan.degrees,
      }, profile.diagnostics);
    }
    case 'boolean': {
      const shapes: BrepShapePlan[] = [];
      const diagnostics = [];
      for (let index = 0; index < plan.shapes.length; index += 1) {
        const lowered = lowerShapeCompilePlanToBrepResultAtPath(plan.shapes[index], `${path}.shapes[${index}]`);
        if (!lowered.ok) {
          diagnostics.push(...lowered.diagnostics);
          continue;
        }
        diagnostics.push(...lowered.diagnostics);
        shapes.push(lowered.value);
      }
      if (shapes.length !== plan.shapes.length) {
        return compilerFailure(...diagnostics);
      }
      return compilerSuccess({
        kind: 'boolean',
        op: plan.op,
        shapes,
      }, diagnostics);
    }
    case 'transform': {
      const base = lowerShapeCompilePlanToBrepResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      return compilerSuccess({
        kind: 'transform',
        base: base.value,
        steps: [...plan.steps],
      }, base.diagnostics);
    }
  }
}

/**
 * Explicit lowering boundary from Forge's canonical compile plan into
 * the exact BREP export subset.
 *
 * The compile plan is allowed to express runtime-tessellated shapes such as
 * segmented circles, cylinders, spheres, or revolved solids. Those are valid
 * Forge plans, but they are not part of the current exact export subset, so
 * this lowerer rejects them instead of silently upgrading faceted intent to
 * analytic CAD geometry.
 */
export function lowerProfileCompilePlanToBrepResult(plan: ProfileCompilePlan | null): CompileLoweringResult<BrepProfilePlan> {
  return lowerProfileCompilePlanToBrepResultAtPath(plan, '$');
}

export function lowerShapeCompilePlanToBrepResult(plan: ShapeCompilePlan | null): CompileLoweringResult<BrepShapePlan> {
  return lowerShapeCompilePlanToBrepResultAtPath(plan, '$');
}

export function lowerProfileCompilePlanToBrepPlan(plan: ProfileCompilePlan | null): BrepProfilePlan | null {
  const lowered = lowerProfileCompilePlanToBrepResult(plan);
  return lowered.ok ? lowered.value : null;
}

export function lowerShapeCompilePlanToBrepPlan(plan: ShapeCompilePlan | null): BrepShapePlan | null {
  const lowered = lowerShapeCompilePlanToBrepResult(plan);
  return lowered.ok ? lowered.value : null;
}

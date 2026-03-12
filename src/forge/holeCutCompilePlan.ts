import type { FeatureCutExtent, ProfileCompilePlan, ShapeCompilePlan } from './compilePlan';
import {
  appendShapeCompileTransform,
  buildBooleanShapeCompilePlan,
  cloneProfileCompilePlan,
  cloneShapeCompilePlan,
} from './compilePlan';
import {
  cloneShapeWorkplanePlacement,
  type ShapeWorkplanePlacement,
} from './sketch/workplaneModel';

export type HoleCutCompilePlanLoweringResult =
  | { ok: true; plan: ShapeCompilePlan }
  | { ok: false; reason: string };

function cloneFeatureCutExtent(extent: FeatureCutExtent): FeatureCutExtent {
  return {
    kind: extent.kind,
    depth: extent.depth,
  };
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function featureCutClearance(depth: number): number {
  return Math.max(0.01, Math.min(0.25, depth * 0.01));
}

function buildPlacedCutterPlan(
  cutter: ShapeCompilePlan,
  placement: ShapeWorkplanePlacement,
  extent: FeatureCutExtent,
): HoleCutCompilePlanLoweringResult {
  if (!isFinitePositive(extent.depth)) {
    return { ok: false, reason: 'Hole/cut features require a positive finite depth.' };
  }

  const clearance = featureCutClearance(extent.depth);
  const height = extent.depth + clearance * 2;
  const base = (() => {
    switch (cutter.kind) {
      case 'cylinder':
        return {
          kind: 'cylinder' as const,
          height,
          radius: cutter.radius,
          center: false,
        };
      case 'extrude':
        return {
          kind: 'extrude' as const,
          profile: cloneProfileCompilePlan(cutter.profile)!,
          height,
          center: false,
        };
      default:
        return null;
    }
  })();

  if (!base) {
    return { ok: false, reason: 'Hole/cut feature lowerer expected an analytic cylinder or extruded profile cutter.' };
  }

  const translated = appendShapeCompileTransform(base, {
    kind: 'translate',
    x: 0,
    y: 0,
    z: -(extent.depth + clearance + placement.placement.protrude),
  });
  if (!translated) {
    return { ok: false, reason: 'Hole/cut features could not translate the cutter into the selected workplane.' };
  }

  const placed = appendShapeCompileTransform(translated, {
    kind: 'workplanePlacement',
    matrix: placement.matrix,
    placement: placement.placement,
  });
  if (!placed) {
    return { ok: false, reason: 'Hole/cut features could not apply the selected workplane placement.' };
  }

  return { ok: true, plan: placed };
}

export function buildHoleShapeCompilePlan(
  base: ShapeCompilePlan | null,
  placement: ShapeWorkplanePlacement | null,
  radius: number,
  extent: FeatureCutExtent,
): ShapeCompilePlan | null {
  if (!base || !placement || !isFinitePositive(radius) || !isFinitePositive(extent.depth)) return null;
  return {
    kind: 'hole',
    base: cloneShapeCompilePlan(base)!,
    placement: cloneShapeWorkplanePlacement(placement)!,
    radius,
    extent: cloneFeatureCutExtent(extent),
  };
}

export function buildCutShapeCompilePlan(
  base: ShapeCompilePlan | null,
  placement: ShapeWorkplanePlacement | null,
  profile: ProfileCompilePlan | null,
  extent: FeatureCutExtent,
): ShapeCompilePlan | null {
  if (!base || !placement || !profile || !isFinitePositive(extent.depth)) return null;
  return {
    kind: 'cut',
    base: cloneShapeCompilePlan(base)!,
    placement: cloneShapeWorkplanePlacement(placement)!,
    profile: cloneProfileCompilePlan(profile)!,
    extent: cloneFeatureCutExtent(extent),
  };
}

export function lowerHoleShapeCompilePlanToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'hole' }>,
): HoleCutCompilePlanLoweringResult {
  if (!isFinitePositive(plan.radius)) {
    return { ok: false, reason: 'Shape.hole() requires a positive finite diameter.' };
  }
  const cutter = buildPlacedCutterPlan({
    kind: 'cylinder',
    height: plan.extent.depth,
    radius: plan.radius,
    center: false,
  }, plan.placement, plan.extent);
  if (!cutter.ok) return cutter;
  return {
    ok: true,
    plan: buildBooleanShapeCompilePlan('difference', [
      plan.base,
      cutter.plan,
    ])!,
  };
}

export function lowerCutShapeCompilePlanToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'cut' }>,
): HoleCutCompilePlanLoweringResult {
  const cutter = buildPlacedCutterPlan({
    kind: 'extrude',
    profile: plan.profile,
    height: plan.extent.depth,
    center: false,
  }, plan.placement, plan.extent);
  if (!cutter.ok) return cutter;
  return {
    ok: true,
    plan: buildBooleanShapeCompilePlan('difference', [
      plan.base,
      cutter.plan,
    ])!,
  };
}

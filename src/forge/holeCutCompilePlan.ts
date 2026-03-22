import type {
  CutTaperCompilePlan,
  FeatureCutExtent,
  FeatureCutExtentSideCompilePlan,
  HoleCompilePlan,
  ProfileCompilePlan,
  ShapeCompilePlan,
} from './compilePlan';
import {
  appendProfileCompileTransform,
  appendShapeCompileTransform,
  buildBooleanShapeCompilePlan,
  cloneProfileCompilePlan,
  cloneShapeCompilePlan,
  featureCutExtentDepth,
  featureCutExtentForwardSide,
} from './compilePlan';
import { cloneFaceQueryRef } from './queryModel';
import {
  cloneShapeWorkplanePlacement,
  type ShapeWorkplanePlacement,
} from './sketch/workplaneModel';

export type HoleCutCompilePlanLoweringResult =
  | { ok: true; plan: ShapeCompilePlan }
  | { ok: false; reason: string };

function cloneFeatureCutExtentSide(extent: FeatureCutExtentSideCompilePlan): FeatureCutExtentSideCompilePlan {
  switch (extent.kind) {
    case 'through':
    case 'blind':
      return {
        kind: extent.kind,
        depth: extent.depth,
      };
    case 'upToFace':
      return {
        kind: 'upToFace',
        depth: extent.depth,
        face: cloneFaceQueryRef(extent.face)!,
      };
  }
}

function cloneFeatureCutExtent(extent: FeatureCutExtent): FeatureCutExtent {
  if (extent.kind === 'two-sided') {
    return {
      kind: 'two-sided',
      forward: cloneFeatureCutExtentSide(extent.forward),
      reverse: cloneFeatureCutExtentSide(extent.reverse) as Exclude<FeatureCutExtentSideCompilePlan, { kind: 'through' }>,
    };
  }
  return cloneFeatureCutExtentSide(extent);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function featureCutClearance(depth: number): number {
  return Math.max(0.01, Math.min(0.25, depth * 0.01));
}

function translateCutterPlan(
  cutter: ShapeCompilePlan,
  z: number,
): ShapeCompilePlan | null {
  return appendShapeCompileTransform(cutter, {
    kind: 'translate',
    x: 0,
    y: 0,
    z,
  });
}

function placeCutterPlan(
  cutter: ShapeCompilePlan,
  placement: ShapeWorkplanePlacement,
): HoleCutCompilePlanLoweringResult {
  const placed = appendShapeCompileTransform(cutter, {
    kind: 'workplanePlacement',
    matrix: placement.matrix,
    placement: placement.placement,
  });
  if (!placed) {
    return { ok: false, reason: 'Hole/cut features could not apply the selected workplane placement.' };
  }

  return { ok: true, plan: placed };
}

function buildPlacedCutCutterPlan(
  cutter: ShapeCompilePlan,
  placement: ShapeWorkplanePlacement,
  extent: FeatureCutExtent,
  taper: CutTaperCompilePlan | undefined,
): HoleCutCompilePlanLoweringResult {
  const forward = featureCutExtentForwardSide(extent);
  const totalDepth = featureCutExtentDepth(extent);
  if (!isFinitePositive(totalDepth)) {
    return { ok: false, reason: 'Hole/cut features require a positive finite depth.' };
  }

  const clearance = featureCutClearance(totalDepth);
  const height = totalDepth + clearance * 2;
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
        if (taper && (!isFinitePositive(taper.scale[0]) || !isFinitePositive(taper.scale[1]))) {
          return null;
        }
        const baseProfile = cloneProfileCompilePlan(cutter.profile);
        if (!baseProfile) return null;
        const taperedProfile = taper
          ? appendProfileCompileTransform(baseProfile, {
              kind: 'scale',
              x: taper.scale[0],
              y: taper.scale[1],
            })
          : baseProfile;
        if (!taperedProfile) return null;
        return {
          kind: 'extrude' as const,
          profile: taperedProfile,
          height,
          center: false,
          scaleTop: taper ? [1 / taper.scale[0], 1 / taper.scale[1]] as [number, number] : undefined,
        };
      default:
        return null;
    }
  })();

  if (!base) {
    return { ok: false, reason: 'Hole/cut feature lowerer expected an analytic cylinder or extruded profile cutter.' };
  }

  const translated = translateCutterPlan(base, -(forward.depth + clearance + placement.placement.protrude));
  if (!translated) {
    return { ok: false, reason: 'Hole/cut features could not translate the cutter into the selected workplane.' };
  }

  return placeCutterPlan(translated, placement);
}

function buildHoleCutterPlan(
  hole: HoleCompilePlan,
  placement: ShapeWorkplanePlacement,
  extent: FeatureCutExtent,
): HoleCutCompilePlanLoweringResult {
  if (!isFinitePositive(hole.radius)) {
    return { ok: false, reason: 'Shape.hole() requires a positive finite diameter.' };
  }
  const forward = featureCutExtentForwardSide(extent);
  const totalDepth = featureCutExtentDepth(extent);
  if (!isFinitePositive(totalDepth)) {
    return { ok: false, reason: 'Hole/cut features require a positive finite depth.' };
  }

  const clearance = featureCutClearance(totalDepth);
  const shapes: ShapeCompilePlan[] = [];
  const shaft = translateCutterPlan({
    kind: 'cylinder',
    height: totalDepth + clearance * 2,
    radius: hole.radius,
    center: false,
  }, -(forward.depth + clearance + placement.placement.protrude));
  if (!shaft) {
    return { ok: false, reason: 'Hole/cut features could not translate the cutter into the selected workplane.' };
  }
  shapes.push(shaft);

  if (hole.counterbore) {
    if (!isFinitePositive(hole.counterbore.radius) || !isFinitePositive(hole.counterbore.depth)) {
      return { ok: false, reason: 'Shape.hole() counterbores require positive finite diameter and depth.' };
    }
    const counterbore = translateCutterPlan({
      kind: 'cylinder',
      height: hole.counterbore.depth + clearance,
      radius: hole.counterbore.radius,
      center: false,
    }, -(hole.counterbore.depth + placement.placement.protrude));
    if (!counterbore) {
      return { ok: false, reason: 'Hole/cut features could not translate the cutter into the selected workplane.' };
    }
    shapes.push(counterbore);
  }

  if (hole.countersink) {
    if (!isFinitePositive(hole.countersink.radius) || !isFinitePositive(hole.countersink.depth)) {
      return { ok: false, reason: 'Shape.hole() countersinks require positive finite diameter and depth.' };
    }
    const frustum = translateCutterPlan({
      kind: 'cylinder',
      height: hole.countersink.depth,
      radius: hole.radius,
      radiusTop: hole.countersink.radius,
      center: false,
    }, -(hole.countersink.depth + placement.placement.protrude));
    if (!frustum) {
      return { ok: false, reason: 'Hole/cut features could not translate the cutter into the selected workplane.' };
    }
    const cap = translateCutterPlan({
      kind: 'cylinder',
      height: clearance,
      radius: hole.countersink.radius,
      center: false,
    }, -placement.placement.protrude);
    if (!cap) {
      return { ok: false, reason: 'Hole/cut features could not translate the cutter into the selected workplane.' };
    }
    shapes.push(frustum, cap);
  }

  const localCutter = shapes.length === 1 ? shapes[0] : buildBooleanShapeCompilePlan('union', shapes);
  if (!localCutter) {
    return { ok: false, reason: 'Hole/cut features could not combine the selected cutter components.' };
  }
  return placeCutterPlan(localCutter, placement);
}

export function buildHoleShapeCompilePlan(
  base: ShapeCompilePlan | null,
  placement: ShapeWorkplanePlacement | null,
  hole: HoleCompilePlan | null,
  extent: FeatureCutExtent,
): ShapeCompilePlan | null {
  if (!base || !placement || !hole || !isFinitePositive(hole.radius) || !isFinitePositive(featureCutExtentDepth(extent))) return null;
  return {
    kind: 'hole',
    base: cloneShapeCompilePlan(base)!,
    placement: cloneShapeWorkplanePlacement(placement)!,
    hole: {
      radius: hole.radius,
      counterbore: hole.counterbore ? { radius: hole.counterbore.radius, depth: hole.counterbore.depth } : undefined,
      countersink: hole.countersink
        ? {
            radius: hole.countersink.radius,
            angleDeg: hole.countersink.angleDeg,
            depth: hole.countersink.depth,
          }
        : undefined,
      thread: hole.thread
        ? {
            designation: hole.thread.designation,
            pitch: hole.thread.pitch,
            class: hole.thread.class,
            handedness: hole.thread.handedness,
            depth: hole.thread.depth,
            modeled: hole.thread.modeled,
          }
        : undefined,
    },
    extent: cloneFeatureCutExtent(extent),
  };
}

export function buildCutShapeCompilePlan(
  base: ShapeCompilePlan | null,
  placement: ShapeWorkplanePlacement | null,
  profile: ProfileCompilePlan | null,
  extent: FeatureCutExtent,
  taper?: CutTaperCompilePlan,
): ShapeCompilePlan | null {
  if (!base || !placement || !profile || !isFinitePositive(featureCutExtentDepth(extent))) return null;
  return {
    kind: 'cut',
    base: cloneShapeCompilePlan(base)!,
    placement: cloneShapeWorkplanePlacement(placement)!,
    profile: cloneProfileCompilePlan(profile)!,
    extent: cloneFeatureCutExtent(extent),
    taper: taper ? { scale: [taper.scale[0], taper.scale[1]] } : undefined,
  };
}

export function lowerHoleShapeCompilePlanToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'hole' }>,
): HoleCutCompilePlanLoweringResult {
  const cutter = buildHoleCutterPlan(plan.hole, plan.placement, plan.extent);
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
  const cutter = buildPlacedCutCutterPlan({
    kind: 'extrude',
    profile: plan.profile,
    height: featureCutExtentDepth(plan.extent),
    center: false,
  }, plan.placement, plan.extent, plan.taper);
  if (!cutter.ok) return cutter;
  return {
    ok: true,
    plan: buildBooleanShapeCompilePlan('difference', [
      plan.base,
      cutter.plan,
    ])!,
  };
}

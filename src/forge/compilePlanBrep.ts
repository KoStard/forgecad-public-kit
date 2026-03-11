import type { ProfileCompilePlan, ShapeCompilePlan } from './compilePlan';
import type { BrepProfilePlan, BrepShapePlan } from './brepPlan';

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
export function lowerProfileCompilePlanToBrepPlan(plan: ProfileCompilePlan | null): BrepProfilePlan | null {
  if (!plan) return null;

  switch (plan.kind) {
    case 'rect':
      return {
        kind: 'rect',
        width: plan.width,
        height: plan.height,
        center: plan.center,
        transforms: [...plan.transforms],
      };
    case 'roundedRect':
      return {
        kind: 'roundedRect',
        width: plan.width,
        height: plan.height,
        radius: plan.radius,
        center: plan.center,
        transforms: [...plan.transforms],
      };
    case 'circle':
      if (plan.segments != null && plan.segments > 0) return null;
      return {
        kind: 'circle',
        radius: plan.radius,
        transforms: [...plan.transforms],
      };
    case 'polygon':
      return {
        kind: 'polygon',
        points: plan.points.map(([x, y]) => [x, y]),
        transforms: [...plan.transforms],
      };
    case 'boolean': {
      const profiles = plan.profiles
        .map((profile) => lowerProfileCompilePlanToBrepPlan(profile))
        .filter((profile): profile is BrepProfilePlan => profile != null);
      if (profiles.length !== plan.profiles.length) return null;
      return {
        kind: 'boolean',
        op: plan.op,
        profiles,
        transforms: [...plan.transforms],
      };
    }
    case 'offset': {
      const base = lowerProfileCompilePlanToBrepPlan(plan.base);
      if (!base) return null;
      return {
        kind: 'offset',
        base,
        delta: plan.delta,
        join: plan.join,
        transforms: [...plan.transforms],
      };
    }
  }
}

export function lowerShapeCompilePlanToBrepPlan(plan: ShapeCompilePlan | null): BrepShapePlan | null {
  if (!plan) return null;

  switch (plan.kind) {
    case 'box':
      return { kind: 'box', x: plan.x, y: plan.y, z: plan.z, center: plan.center };
    case 'cylinder':
      if (plan.segments != null && plan.segments > 0) return null;
      return {
        kind: 'cylinder',
        height: plan.height,
        radius: plan.radius,
        radiusTop: plan.radiusTop,
        center: plan.center,
      };
    case 'sphere':
      if (plan.segments != null && plan.segments > 0) return null;
      return { kind: 'sphere', radius: plan.radius };
    case 'extrude': {
      const profile = lowerProfileCompilePlanToBrepPlan(plan.profile);
      if (!profile) return null;
      return {
        kind: 'extrude',
        profile,
        height: plan.height,
        center: plan.center,
        scaleTop: plan.scaleTop ? [plan.scaleTop[0], plan.scaleTop[1]] : undefined,
      };
    }
    case 'revolve': {
      if (plan.segments != null && plan.segments > 0) return null;
      const profile = lowerProfileCompilePlanToBrepPlan(plan.profile);
      if (!profile) return null;
      return {
        kind: 'revolve',
        profile,
        degrees: plan.degrees,
      };
    }
    case 'boolean': {
      const shapes = plan.shapes
        .map((shape) => lowerShapeCompilePlanToBrepPlan(shape))
        .filter((shape): shape is BrepShapePlan => shape != null);
      if (shapes.length !== plan.shapes.length) return null;
      return {
        kind: 'boolean',
        op: plan.op,
        shapes,
      };
    }
    case 'transform': {
      const base = lowerShapeCompilePlanToBrepPlan(plan.base);
      if (!base) return null;
      return {
        kind: 'transform',
        base,
        steps: [...plan.steps],
      };
    }
  }
}

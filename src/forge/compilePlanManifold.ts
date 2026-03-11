import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  ProfileCompilePlan,
  ProfileCompileTransformStep,
  ShapeCompilePlan,
  ShapeCompileTransformStep,
} from './compilePlan';
import { wrapManifoldShapeBackend, type ShapeBackend } from './shapeBackend';
import { buildLoftLevelSetInput, buildSweepLevelSetInput } from './sketch/loftSweepLowering';
import { Transform } from './transform';

function applyProfileCompileTransform(
  crossSection: CrossSection,
  step: ProfileCompileTransformStep,
): CrossSection {
  switch (step.kind) {
    case 'translate':
      return crossSection.translate(step.x, step.y);
    case 'rotate':
      return crossSection.rotate(step.degrees);
    case 'scale':
      return crossSection.scale([step.x, step.y] as [number, number]);
    case 'mirror':
      return crossSection.mirror([step.normalX, step.normalY]);
  }
}

function applyProfileCompileTransforms(
  crossSection: CrossSection,
  transforms: ProfileCompileTransformStep[],
): CrossSection {
  let out = crossSection;
  for (const step of transforms) {
    out = applyProfileCompileTransform(out, step);
  }
  return out;
}

function lowerProfileBooleanCompilePlan(plan: Extract<ProfileCompilePlan, { kind: 'boolean' }>, wasm: ManifoldToplevel): CrossSection {
  const profiles = plan.profiles.map((profile) => lowerProfileCompilePlanToCrossSection(profile, wasm));
  if (profiles.length === 0) {
    throw new Error(`Cannot lower empty profile boolean (${plan.op})`);
  }
  if (profiles.length === 1) {
    return applyProfileCompileTransforms(profiles[0], plan.transforms);
  }

  const combined = (() => {
    switch (plan.op) {
      case 'union':
        return wasm.CrossSection.union(profiles);
      case 'difference':
        return wasm.CrossSection.difference(profiles);
      case 'intersection':
        return wasm.CrossSection.intersection(profiles);
    }
  })();

  return applyProfileCompileTransforms(combined, plan.transforms);
}

function lowerProfileHullCompilePlan(plan: Extract<ProfileCompilePlan, { kind: 'hull' }>, wasm: ManifoldToplevel): CrossSection {
  const profiles = plan.profiles.map((profile) => lowerProfileCompilePlanToCrossSection(profile, wasm));
  if (profiles.length === 0) {
    throw new Error('Cannot lower empty profile hull');
  }
  if (profiles.length === 1) {
    return applyProfileCompileTransforms(profiles[0], plan.transforms);
  }
  return applyProfileCompileTransforms(wasm.CrossSection.hull(profiles), plan.transforms);
}

export function lowerProfileCompilePlanToCrossSection(
  plan: ProfileCompilePlan,
  wasm: ManifoldToplevel,
): CrossSection {
  switch (plan.kind) {
    case 'rect':
      return applyProfileCompileTransforms(
        wasm.CrossSection.square([plan.width, plan.height], plan.center),
        plan.transforms,
      );
    case 'roundedRect': {
      const radius = Math.min(plan.radius, plan.width / 2, plan.height / 2);
      const crossSection = wasm.CrossSection.square([plan.width - 2 * radius, plan.height - 2 * radius], true)
        .translate(plan.center ? 0 : plan.width / 2, plan.center ? 0 : plan.height / 2)
        .offset(radius, 'Round');
      return applyProfileCompileTransforms(crossSection, plan.transforms);
    }
    case 'circle':
      return applyProfileCompileTransforms(wasm.CrossSection.circle(plan.radius, plan.segments ?? 0), plan.transforms);
    case 'polygon':
      return applyProfileCompileTransforms(new wasm.CrossSection([plan.points]), plan.transforms);
    case 'boolean':
      return lowerProfileBooleanCompilePlan(plan, wasm);
    case 'offset':
      return applyProfileCompileTransforms(
        lowerProfileCompilePlanToCrossSection(plan.base, wasm).offset(plan.delta, plan.join),
        plan.transforms,
      );
    case 'hull':
      return lowerProfileHullCompilePlan(plan, wasm);
  }
}

function applyShapeCompileTransform(manifold: Manifold, step: ShapeCompileTransformStep): Manifold {
  switch (step.kind) {
    case 'translate':
      return manifold.translate(step.x, step.y, step.z);
    case 'rotate':
      return manifold.rotate(step.xDeg, step.yDeg, step.zDeg);
    case 'scale':
      return manifold.scale([step.x, step.y, step.z] as [number, number, number]);
    case 'rotateAround':
      return manifold.transform(
        Transform.rotationAxis(
          [step.axisX, step.axisY, step.axisZ],
          step.degrees,
          [step.pivotX, step.pivotY, step.pivotZ],
        ).toArray(),
      );
    case 'mirror':
      return manifold.mirror([step.normalX, step.normalY, step.normalZ]);
    case 'workplanePlacement':
      return manifold.transform(step.matrix);
  }
}

function applyShapeCompileTransforms(manifold: Manifold, steps: ShapeCompileTransformStep[]): Manifold {
  let out = manifold;
  for (const step of steps) {
    out = applyShapeCompileTransform(out, step);
  }
  return out;
}

function lowerShapeBooleanCompilePlan(plan: Extract<ShapeCompilePlan, { kind: 'boolean' }>, wasm: ManifoldToplevel): Manifold {
  const shapes = plan.shapes.map((shape) => lowerShapeCompilePlanToManifold(shape, wasm));
  if (shapes.length === 0) {
    throw new Error(`Cannot lower empty shape boolean (${plan.op})`);
  }
  if (shapes.length === 1) {
    return shapes[0];
  }

  switch (plan.op) {
    case 'union':
      return wasm.Manifold.union(shapes);
    case 'difference':
      return wasm.Manifold.difference(shapes);
    case 'intersection':
      return wasm.Manifold.intersection(shapes);
  }
}

function lowerShapeHullCompilePlan(plan: Extract<ShapeCompilePlan, { kind: 'hull' }>, wasm: ManifoldToplevel): Manifold {
  const shapeItems = plan.shapes.map((shape) => lowerShapeCompilePlanToManifold(shape, wasm));
  const items = [...shapeItems, ...plan.points.map(([x, y, z]) => [x, y, z] as [number, number, number])];
  if (items.length === 0) {
    throw new Error('Cannot lower empty shape hull');
  }
  return wasm.Manifold.hull(items);
}

function lowerShapeTrimByPlaneCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'trimByPlane' }>,
  wasm: ManifoldToplevel,
): Manifold {
  return lowerShapeCompilePlanToManifold(plan.base, wasm).trimByPlane(
    [plan.normalX, plan.normalY, plan.normalZ],
    plan.originOffset,
  );
}

function lowerShapeLoftCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'loft' }>,
  wasm: ManifoldToplevel,
): Manifold {
  const input = buildLoftLevelSetInput(
    plan.profiles.map((profile) => lowerProfileCompilePlanToCrossSection(profile, wasm).toPolygons() as [number, number][][]),
    plan.heights,
    { edgeLength: plan.edgeLength, boundsPadding: plan.boundsPadding },
  );
  return wasm.Manifold.levelSet(input.sdf as any, input.bounds, input.edgeLength, 0);
}

function lowerShapeSweepCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'sweep' }>,
  wasm: ManifoldToplevel,
): Manifold {
  const input = buildSweepLevelSetInput(
    lowerProfileCompilePlanToCrossSection(plan.profile, wasm).toPolygons() as [number, number][][],
    plan.path.points.map(([x, y, z]) => [x, y, z]),
    {
      edgeLength: plan.edgeLength,
      boundsPadding: plan.boundsPadding,
      up: [plan.up[0], plan.up[1], plan.up[2]],
    },
  );
  return wasm.Manifold.levelSet(input.sdf as any, input.bounds, input.edgeLength, 0);
}

export function lowerShapeCompilePlanToManifold(
  plan: ShapeCompilePlan,
  wasm: ManifoldToplevel,
): Manifold {
  switch (plan.kind) {
    case 'box':
      return wasm.Manifold.cube([plan.x, plan.y, plan.z], plan.center);
    case 'cylinder':
      return wasm.Manifold.cylinder(plan.height, plan.radius, plan.radiusTop ?? -1, plan.segments ?? 0, plan.center);
    case 'sphere':
      return wasm.Manifold.sphere(plan.radius, plan.segments ?? 0);
    case 'extrude':
      return lowerProfileCompilePlanToCrossSection(plan.profile, wasm).extrude(
        plan.height,
        0,
        0,
        plan.scaleTop as [number, number] | undefined,
        plan.center,
      );
    case 'revolve':
      return lowerProfileCompilePlanToCrossSection(plan.profile, wasm).revolve(plan.segments ?? 0, plan.degrees);
    case 'loft':
      return lowerShapeLoftCompilePlan(plan, wasm);
    case 'sweep':
      return lowerShapeSweepCompilePlan(plan, wasm);
    case 'boolean':
      return lowerShapeBooleanCompilePlan(plan, wasm);
    case 'transform':
      return applyShapeCompileTransforms(lowerShapeCompilePlanToManifold(plan.base, wasm), plan.steps);
    case 'hull':
      return lowerShapeHullCompilePlan(plan, wasm);
    case 'trimByPlane':
      return lowerShapeTrimByPlaneCompilePlan(plan, wasm);
  }
}

export function lowerShapeCompilePlanToShapeBackend(
  plan: ShapeCompilePlan,
  wasm: ManifoldToplevel,
): ShapeBackend {
  return wrapManifoldShapeBackend(lowerShapeCompilePlanToManifold(plan, wasm));
}

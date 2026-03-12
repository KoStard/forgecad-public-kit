import type { ShapeCompilePlan, ShapeCompileTransformStep } from './compilePlan';
import {
  appendShapeCompileTransform,
  buildBooleanShapeCompilePlan,
  buildOffsetProfileCompilePlan,
  cloneShapeCompilePlan,
  wrapShapeCompilePlanWithQueryOwner,
} from './compilePlan';

export type ShellOpenFace = 'top' | 'bottom';

export type ShellCompilePlanLoweringResult =
  | { ok: true; plan: ShapeCompilePlan }
  | { ok: false; reason: string };

function normalizeShellOpenFaces(openFaces: readonly ShellOpenFace[] | undefined): ShellOpenFace[] {
  const ordered: ShellOpenFace[] = [];
  for (const face of openFaces ?? []) {
    if (face !== 'top' && face !== 'bottom') {
      throw new Error(`Shape.shell() only supports "top" and "bottom" openings, got "${face}"`);
    }
    if (!ordered.includes(face)) ordered.push(face);
  }
  return ordered;
}

function isRigidShellTransformStep(step: ShapeCompileTransformStep): boolean {
  return step.kind !== 'scale';
}

function buildHeightShellSpan(
  totalHeight: number,
  center: boolean,
  thickness: number,
  openFaces: readonly ShellOpenFace[],
): { height: number; translateZ: number } | null {
  const openTop = openFaces.includes('top');
  const openBottom = openFaces.includes('bottom');
  const start = center
    ? -totalHeight / 2 + (openBottom ? 0 : thickness)
    : (openBottom ? 0 : thickness);
  const end = center
    ? totalHeight / 2 - (openTop ? 0 : thickness)
    : totalHeight - (openTop ? 0 : thickness);
  const height = end - start;
  if (!(height > 0)) return null;
  return {
    height,
    translateZ: center ? (start + end) / 2 : start,
  };
}

function translateShapePlanZ(plan: ShapeCompilePlan, z: number): ShapeCompilePlan {
  if (Math.abs(z) <= 1e-12) return plan;
  return appendShapeCompileTransform(plan, { kind: 'translate', x: 0, y: 0, z })!;
}

function translateShapePlan(plan: ShapeCompilePlan, x: number, y: number, z: number): ShapeCompilePlan {
  let out = plan;
  if (Math.abs(x) > 1e-12 || Math.abs(y) > 1e-12 || Math.abs(z) > 1e-12) {
    out = appendShapeCompileTransform(out, { kind: 'translate', x, y, z })!;
  }
  return out;
}

function lowerBoxShellToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'box' }>,
  thickness: number,
  openFaces: readonly ShellOpenFace[],
): ShellCompilePlanLoweringResult {
  const innerX = plan.x - 2 * thickness;
  const innerY = plan.y - 2 * thickness;
  if (!(innerX > 0) || !(innerY > 0)) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this box base.' };
  }

  const span = buildHeightShellSpan(plan.z, plan.center, thickness, openFaces);
  if (!span) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this box height and opening configuration.' };
  }

  const inner = translateShapePlan(
    {
      kind: 'box',
      x: innerX,
      y: innerY,
      z: span.height,
      center: plan.center,
    },
    plan.center ? 0 : thickness,
    plan.center ? 0 : thickness,
    span.translateZ,
  );
  return { ok: true, plan: buildBooleanShapeCompilePlan('difference', [plan, inner])! };
}

function lowerCylinderShellToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'cylinder' }>,
  thickness: number,
  openFaces: readonly ShellOpenFace[],
): ShellCompilePlanLoweringResult {
  const innerRadius = plan.radius - thickness;
  const innerRadiusTop = plan.radiusTop == null ? undefined : plan.radiusTop - thickness;
  if (!(innerRadius > 0) || (innerRadiusTop != null && !(innerRadiusTop > 0))) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this cylinder or cone base.' };
  }

  const span = buildHeightShellSpan(plan.height, plan.center, thickness, openFaces);
  if (!span) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this cylinder height and opening configuration.' };
  }

  const inner = translateShapePlanZ({
    kind: 'cylinder',
    height: span.height,
    radius: innerRadius,
    radiusTop: innerRadiusTop,
    center: plan.center,
  }, span.translateZ);
  return { ok: true, plan: buildBooleanShapeCompilePlan('difference', [plan, inner])! };
}

function lowerExtrudeShellToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'extrude' }>,
  thickness: number,
  openFaces: readonly ShellOpenFace[],
): ShellCompilePlanLoweringResult {
  if (plan.scaleTop) {
    return {
      ok: false,
      reason: 'Shape.shell() v1 does not support tapered extrudes (`scaleTop`) yet.',
    };
  }

  const innerProfile = buildOffsetProfileCompilePlan(plan.profile, -thickness, 'Round');
  if (!innerProfile) {
    return { ok: false, reason: 'Shape.shell() could not offset the source profile for this extrude base.' };
  }

  const span = buildHeightShellSpan(plan.height, plan.center, thickness, openFaces);
  if (!span) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this extrude height and opening configuration.' };
  }

  const inner = translateShapePlanZ({
    kind: 'extrude',
    profile: innerProfile,
    height: span.height,
    center: plan.center,
  }, span.translateZ);
  return { ok: true, plan: buildBooleanShapeCompilePlan('difference', [plan, inner])! };
}

function lowerBaseShellPlanToConcretePlan(
  plan: ShapeCompilePlan,
  thickness: number,
  openFaces: readonly ShellOpenFace[],
): ShellCompilePlanLoweringResult {
  switch (plan.kind) {
    case 'queryOwner': {
      const lowered = lowerBaseShellPlanToConcretePlan(plan.base, thickness, openFaces);
      if (!lowered.ok) return lowered;
      return {
        ok: true,
        plan: wrapShapeCompilePlanWithQueryOwner(lowered.plan, plan.owner)!,
      };
    }
    case 'transform': {
      if (!plan.steps.every(isRigidShellTransformStep)) {
        return {
          ok: false,
          reason: 'Shape.shell() v1 supports only rigid transforms before shelling. Scale transforms are not supported yet.',
        };
      }
      const lowered = lowerBaseShellPlanToConcretePlan(plan.base, thickness, openFaces);
      if (!lowered.ok) return lowered;
      return {
        ok: true,
        plan: cloneShapeCompilePlan({
          kind: 'transform',
          base: lowered.plan,
          steps: plan.steps.map((step) => ({ ...step })),
        })!,
      };
    }
    case 'box':
      return lowerBoxShellToConcretePlan(plan, thickness, openFaces);
    case 'cylinder':
      return lowerCylinderShellToConcretePlan(plan, thickness, openFaces);
    case 'extrude':
      return lowerExtrudeShellToConcretePlan(plan, thickness, openFaces);
    case 'shell':
      return {
        ok: false,
        reason: 'Shape.shell() v1 does not support shelling an already-shelled result yet.',
      };
    case 'fillet':
    case 'chamfer':
      return {
        ok: false,
        reason: 'Shape.shell() v1 does not support edge-finished bodies yet.',
      };
    case 'sphere':
    case 'hole':
    case 'cut':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'boolean':
    case 'hull':
    case 'trimByPlane':
      return {
        ok: false,
        reason: 'Shape.shell() v1 currently supports compile-covered box(), cylinder(), and straight extrude() bases with optional top/bottom openings.',
      };
  }
}

export function buildShellShapeCompilePlan(
  base: ShapeCompilePlan | null,
  thickness: number,
  openFaces: readonly ShellOpenFace[] = [],
): ShapeCompilePlan | null {
  if (!base) return null;
  if (!Number.isFinite(thickness) || !(thickness > 0)) return null;
  const plan: ShapeCompilePlan = {
    kind: 'shell',
    base: cloneShapeCompilePlan(base)!,
    thickness,
    openFaces: normalizeShellOpenFaces(openFaces),
  };
  return lowerShellShapeCompilePlanToConcretePlan(plan).ok ? plan : null;
}

export function lowerShellShapeCompilePlanToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'shell' }>,
): ShellCompilePlanLoweringResult {
  if (!Number.isFinite(plan.thickness) || !(plan.thickness > 0)) {
    return { ok: false, reason: 'Shape.shell() requires a positive finite wall thickness.' };
  }
  return lowerBaseShellPlanToConcretePlan(plan.base, plan.thickness, normalizeShellOpenFaces(plan.openFaces));
}

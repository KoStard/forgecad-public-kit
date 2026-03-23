import type { ShapeCompilePlan, ShapeCompileTransformStep } from './compilePlan';
import {
  appendShapeCompileTransform,
  assertExhaustive,
  buildBooleanShapeCompilePlan,
  buildOffsetProfileCompilePlan,
  cloneShapeCompilePlan,
  wrapShapeCompilePlanWithQueryOwner,
} from './compilePlan';

export type ShellOpenFace = string;

export type ShellCompilePlanLoweringResult =
  | { ok: true; plan: ShapeCompilePlan }
  | { ok: false; reason: string };

// Canonical face name aliases. Users may write 'front', 'back', 'left', 'right' in openFaces;
// the compiler normalises these to the internal face-table names before storing in the plan.
const SHELL_OPEN_FACE_CANONICAL: Record<string, string> = {
  front: 'side-bottom',
  back: 'side-top',
  right: 'side-right',
  left: 'side-left',
};

function normalizeShellOpenFaces(openFaces: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of openFaces ?? []) {
    const resolved = SHELL_OPEN_FACE_CANONICAL[f] ?? f;
    if (!seen.has(resolved)) {
      seen.add(resolved);
      result.push(resolved);
    }
  }
  return result;
}

function isRigidShellTransformStep(step: ShapeCompileTransformStep): boolean {
  return step.kind !== 'scale';
}

// General axis span for one dimension of a shell inner body.
// openMin removes the wall at the axis minimum (e.g. bottom for Z, side-left for X).
// openMax removes the wall at the axis maximum (e.g. top for Z, side-right for X).
// Returns {size, translate} where translate is the offset to apply to the inner body
// so its extent matches [start, start+size] in the outer body's coordinate frame.
function buildAxisShellSpan(
  total: number,
  center: boolean,
  thickness: number,
  openMin: boolean,
  openMax: boolean,
): { size: number; translate: number } | null {
  const start = center
    ? -total / 2 + (openMin ? 0 : thickness)
    : (openMin ? 0 : thickness);
  const end = center
    ? total / 2 - (openMax ? 0 : thickness)
    : total - (openMax ? 0 : thickness);
  const size = end - start;
  if (!(size > 0)) return null;
  return { size, translate: center ? (start + end) / 2 : start };
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
  openFaces: readonly string[],
): ShellCompilePlanLoweringResult {
  // openFaces uses internal face-table names after normalisation.
  // Box faces: top, bottom, side-left (−X), side-right (+X), side-bottom (−Y/front), side-top (+Y/back).
  const xSpan = buildAxisShellSpan(plan.x, plan.center, thickness,
    openFaces.includes('side-left'), openFaces.includes('side-right'));
  const ySpan = buildAxisShellSpan(plan.y, plan.center, thickness,
    openFaces.includes('side-bottom'), openFaces.includes('side-top'));
  const zSpan = buildAxisShellSpan(plan.z, plan.center, thickness,
    openFaces.includes('bottom'), openFaces.includes('top'));

  if (!xSpan || !ySpan || !zSpan) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this box base and opening configuration.' };
  }

  const inner = translateShapePlan(
    { kind: 'box', x: xSpan.size, y: ySpan.size, z: zSpan.size, center: plan.center },
    xSpan.translate,
    ySpan.translate,
    zSpan.translate,
  );
  return { ok: true, plan: buildBooleanShapeCompilePlan('difference', [plan, inner])! };
}

function lowerCylinderShellToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'cylinder' }>,
  thickness: number,
  openFaces: readonly string[],
): ShellCompilePlanLoweringResult {
  const sideOpenings = openFaces.filter((f) => f !== 'top' && f !== 'bottom');
  if (sideOpenings.length > 0) {
    return {
      ok: false,
      reason: `Shape.shell() supports only "top" and "bottom" openings for cylinder bases. Unsupported opening${sideOpenings.length > 1 ? 's' : ''}: ${sideOpenings.map((f) => `"${f}"`).join(', ')}.`,
    };
  }

  const innerRadius = plan.radius - thickness;
  const innerRadiusTop = plan.radiusTop == null ? undefined : plan.radiusTop - thickness;
  if (!(innerRadius > 0) || (innerRadiusTop != null && !(innerRadiusTop > 0))) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this cylinder or cone base.' };
  }

  const zSpan = buildAxisShellSpan(plan.height, plan.center, thickness,
    openFaces.includes('bottom'), openFaces.includes('top'));
  if (!zSpan) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this cylinder height and opening configuration.' };
  }

  const inner = translateShapePlanZ({
    kind: 'cylinder',
    height: zSpan.size,
    radius: innerRadius,
    radiusTop: innerRadiusTop,
    center: plan.center,
  }, zSpan.translate);
  return { ok: true, plan: buildBooleanShapeCompilePlan('difference', [plan, inner])! };
}

function lowerExtrudeShellToConcretePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'extrude' }>,
  thickness: number,
  openFaces: readonly string[],
): ShellCompilePlanLoweringResult {
  if (plan.scaleTop) {
    return {
      ok: false,
      reason: 'Shape.shell() does not support tapered extrudes (`scaleTop`).',
    };
  }

  const sideOpenings = openFaces.filter((f) => f !== 'top' && f !== 'bottom');
  if (sideOpenings.length > 0) {
    return {
      ok: false,
      reason: `Shape.shell() does not support side face openings for extrude bases (requires non-uniform profile offset). Unsupported opening${sideOpenings.length > 1 ? 's' : ''}: ${sideOpenings.map((f) => `"${f}"`).join(', ')}.`,
    };
  }

  const innerProfile = buildOffsetProfileCompilePlan(plan.profile, -thickness, 'Round');
  if (!innerProfile) {
    return { ok: false, reason: 'Shape.shell() could not offset the source profile for this extrude base.' };
  }

  const zSpan = buildAxisShellSpan(plan.height, plan.center, thickness,
    openFaces.includes('bottom'), openFaces.includes('top'));
  if (!zSpan) {
    return { ok: false, reason: 'Shape.shell() thickness is too large for this extrude height and opening configuration.' };
  }

  const inner = translateShapePlanZ({
    kind: 'extrude',
    profile: innerProfile,
    height: zSpan.size,
    center: plan.center,
  }, zSpan.translate);
  return { ok: true, plan: buildBooleanShapeCompilePlan('difference', [plan, inner])! };
}

function lowerBaseShellPlanToConcretePlan(
  plan: ShapeCompilePlan,
  thickness: number,
  openFaces: readonly string[],
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
          reason: 'Shape.shell() supports only rigid transforms before shelling. Scale transforms are not supported.',
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
        reason: 'Shape.shell() does not support shelling an already-shelled result.',
      };
    case 'fillet':
    case 'chamfer':
    case 'filletEdges':
    case 'chamferEdges':
      return {
        ok: false,
        reason: 'Shape.shell() does not support edge-finished bodies (fillet/chamfer). Apply shell before edge finishing.',
      };
    case 'sphere':
    case 'sheetMetal':
    case 'hole':
    case 'cut':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'boolean':
    case 'trimByPlane':
    case 'importedMesh':
      return {
        ok: false,
        reason: `Shape.shell() supports compile-covered box(), cylinder(), and straight extrude() bases. "${plan.kind}" bases are not supported.`,
      };
    default:
      assertExhaustive(plan);
  }
}

export function buildShellShapeCompilePlan(
  base: ShapeCompilePlan | null,
  thickness: number,
  openFaces: readonly string[] = [],
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

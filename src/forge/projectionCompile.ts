import {
  appendProfileCompileTransform,
  buildBooleanProfileCompilePlan,
  cloneProfileCompilePlan,
  cloneShapeCompilePlan,
  type ProfileCompilePlan,
  type ShapeCompilePlan,
  type ShapeCompileTransformStep,
} from './compilePlan';
import { getShapeCompilePlan, getShapeWorkplanePlacement, type Shape } from './kernel';
import { resolvePlaneFrame, type PlaneFrame, type PlaneSpec } from './planeFrame';
import { Transform } from './transform';
import {
  cloneShapeWorkplanePlacement,
  cloneSketchPlacementModel,
  type ShapeWorkplanePlacement,
} from './sketch/workplaneModel';

const EPS = 1e-6;

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length2d(x: number, y: number): number {
  return Math.hypot(x, y);
}

function normalize(vec: [number, number, number]): [number, number, number] {
  const len = Math.hypot(vec[0], vec[1], vec[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [vec[0] / len, vec[1] / len, vec[2] / len];
}

function nearlyEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function projectionReplayFailure(
  sourceShape: ShapeCompilePlan,
  plane: PlaneFrame,
  sourcePlacement: ShapeWorkplanePlacement['placement'] | undefined,
  reason: string,
): Extract<ProfileCompilePlan, { kind: 'project' }> {
  return {
    kind: 'project',
    sourceShape: cloneShapeCompilePlan(sourceShape)!,
    plane: {
      origin: [plane.origin[0], plane.origin[1], plane.origin[2]],
      u: [plane.u[0], plane.u[1], plane.u[2]],
      v: [plane.v[0], plane.v[1], plane.v[2]],
      normal: [plane.normal[0], plane.normal[1], plane.normal[2]],
    },
    sourcePlacement: sourcePlacement ? cloneSketchPlacementModel(sourcePlacement)! : undefined,
    replayReason: reason,
    transforms: [],
  };
}

type ProjectionReplayContext = {
  profile: ProfileCompilePlan;
  placement: ShapeWorkplanePlacement;
};

type ProjectionReplayDerivation =
  | { ok: true; context: ProjectionReplayContext }
  | { ok: false; reason: string };

const DEFAULT_PROJECTION_PLACEMENT: ShapeWorkplanePlacement = {
  matrix: Transform.identity().toArray(),
  placement: {
    workplane: {
      origin: [0, 0, 0],
      u: [1, 0, 0],
      v: [0, 1, 0],
      normal: [0, 0, 1],
      source: { kind: 'face-ref' },
    },
    u: 0,
    v: 0,
    protrude: 0,
    selfAnchor: 'center',
  },
};

function cloneProjectionReplayContext(context: ProjectionReplayContext): ProjectionReplayContext {
  return {
    profile: cloneProfileCompilePlan(context.profile)!,
    placement: cloneShapeWorkplanePlacement(context.placement)!,
  };
}

function planeFrameFromPlacement(placement: ShapeWorkplanePlacement): PlaneFrame {
  return {
    origin: [
      placement.placement.workplane.origin[0],
      placement.placement.workplane.origin[1],
      placement.placement.workplane.origin[2],
    ],
    u: normalize([
      placement.placement.workplane.u[0],
      placement.placement.workplane.u[1],
      placement.placement.workplane.u[2],
    ]),
    v: normalize([
      placement.placement.workplane.v[0],
      placement.placement.workplane.v[1],
      placement.placement.workplane.v[2],
    ]),
    normal: normalize([
      placement.placement.workplane.normal[0],
      placement.placement.workplane.normal[1],
      placement.placement.workplane.normal[2],
    ]),
  };
}

function mirrorTransformMatrix(normal: [number, number, number]): ShapeWorkplanePlacement['matrix'] {
  const len = Math.hypot(normal[0], normal[1], normal[2]);
  if (len < 1e-12) return Transform.identity().toArray();
  const nx = normal[0] / len;
  const ny = normal[1] / len;
  const nz = normal[2] / len;
  return [
    1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * nz, 0,
    -2 * ny * nx, 1 - 2 * ny * ny, -2 * ny * nz, 0,
    -2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, 0,
    0, 0, 0, 1,
  ];
}

function shapeTransformStepMatrix(
  step: Exclude<ShapeCompileTransformStep, { kind: 'workplanePlacement' }>,
): ShapeWorkplanePlacement['matrix'] {
  switch (step.kind) {
    case 'translate':
      return Transform.translation(step.x, step.y, step.z).toArray();
    case 'rotate':
      return Transform.identity()
        .rotateAxis([1, 0, 0], step.xDeg)
        .rotateAxis([0, 1, 0], step.yDeg)
        .rotateAxis([0, 0, 1], step.zDeg)
        .toArray();
    case 'scale':
      return Transform.scale([step.x, step.y, step.z]).toArray();
    case 'rotateAround':
      return Transform.rotationAxis(
        [step.axisX, step.axisY, step.axisZ],
        step.degrees,
        [step.pivotX, step.pivotY, step.pivotZ],
      ).toArray();
    case 'mirror':
      return mirrorTransformMatrix([step.normalX, step.normalY, step.normalZ]);
  }
}

function applyShapeTransformToPlacement(
  placement: ShapeWorkplanePlacement,
  step: Exclude<ShapeCompileTransformStep, { kind: 'workplanePlacement' }>,
): ShapeWorkplanePlacement {
  const matrix = shapeTransformStepMatrix(step);
  const transform = Transform.from(matrix);
  const current = cloneShapeWorkplanePlacement(placement)!;
  return {
    matrix: Transform.from(current.matrix).mul(matrix).toArray(),
    placement: {
      ...current.placement,
      workplane: {
        ...current.placement.workplane,
        origin: transform.point(current.placement.workplane.origin),
        u: transform.vector(current.placement.workplane.u),
        v: transform.vector(current.placement.workplane.v),
        normal: transform.vector(current.placement.workplane.normal),
      },
    },
  };
}

function mapProfileToPlane(
  profile: ProfileCompilePlan,
  sourcePlacement: ShapeWorkplanePlacement,
  targetPlane: PlaneFrame,
): { profile?: ProfileCompilePlan; reason?: string } {
  const sourceTransform = Transform.from(sourcePlacement.matrix);
  const sourceOrigin = sourceTransform.point([0, 0, 0]);
  const sourceU = sourceTransform.vector([1, 0, 0]);
  const sourceV = sourceTransform.vector([0, 1, 0]);
  const sourceNormal = sourceTransform.vector([0, 0, 1]);

  const normalAlignment = Math.abs(dot(normalize(sourceNormal), targetPlane.normal));
  if (!nearlyEqual(normalAlignment, 1, 1e-5)) {
    return { reason: 'projection replay currently requires the target plane to stay parallel to the source workplane.' };
  }

  const a = dot(sourceU, targetPlane.u);
  const b = dot(sourceV, targetPlane.u);
  const c = dot(sourceU, targetPlane.v);
  const d = dot(sourceV, targetPlane.v);

  const sx = length2d(a, c);
  const sy = length2d(b, d);
  if (sx < EPS || sy < EPS) {
    return { reason: 'projection replay requires a non-degenerate in-plane basis.' };
  }

  const shear = a * b + c * d;
  if (Math.abs(shear) > 1e-5 * Math.max(1, sx * sy)) {
    return { reason: 'projection replay does not support in-plane shear from downstream 3D transforms yet.' };
  }

  const n00 = a / sx;
  const n01 = b / sy;
  const n10 = c / sx;
  const n11 = d / sy;
  const det = n00 * n11 - n01 * n10;
  if (!nearlyEqual(Math.abs(det), 1, 1e-5)) {
    return { reason: 'projection replay requires a rigid or mirrored in-plane basis.' };
  }

  let next = cloneProfileCompilePlan(profile)!;

  if (!nearlyEqual(sx, 1) || !nearlyEqual(sy, 1)) {
    next = appendProfileCompileTransform(next, { kind: 'scale', x: sx, y: sy })!;
  }

  if (det < 0) {
    next = appendProfileCompileTransform(next, { kind: 'mirror', normalX: 1, normalY: 0 })!;
    const angle = Math.atan2(-n10, -n00) * 180 / Math.PI;
    if (!nearlyEqual(angle, 0)) {
      next = appendProfileCompileTransform(next, { kind: 'rotate', degrees: angle })!;
    }
  } else {
    const angle = Math.atan2(n10, n00) * 180 / Math.PI;
    if (!nearlyEqual(angle, 0)) {
      next = appendProfileCompileTransform(next, { kind: 'rotate', degrees: angle })!;
    }
  }

  const delta = sub(sourceOrigin, targetPlane.origin);
  const tx = dot(delta, targetPlane.u);
  const ty = dot(delta, targetPlane.v);
  if (!nearlyEqual(tx, 0) || !nearlyEqual(ty, 0)) {
    next = appendProfileCompileTransform(next, { kind: 'translate', x: tx, y: ty })!;
  }

  return { profile: next };
}

function buildReplayProfile(
  profile: ProfileCompilePlan,
  sourcePlacement: ShapeWorkplanePlacement,
  targetPlane: PlaneFrame,
): { profile?: ProfileCompilePlan; reason?: string } {
  return mapProfileToPlane(profile, sourcePlacement, targetPlane);
}

function circleProjectionProfile(radius: number): ProfileCompilePlan {
  return {
    kind: 'circle',
    radius,
    transforms: [],
  };
}

function holeProjectionRadius(plan: Extract<ShapeCompilePlan, { kind: 'hole' }>): number {
  return Math.max(
    plan.hole.radius,
    plan.hole.counterbore?.radius ?? 0,
    plan.hole.countersink?.radius ?? 0,
  );
}

function defaultProjectionContext(profile: ProfileCompilePlan): ProjectionReplayContext {
  return {
    profile: cloneProfileCompilePlan(profile)!,
    placement: cloneShapeWorkplanePlacement(DEFAULT_PROJECTION_PLACEMENT)!,
  };
}

function reorientProjectionContext(
  context: ProjectionReplayContext,
  targetPlacement: ShapeWorkplanePlacement,
): ProjectionReplayDerivation {
  const mapped = mapProfileToPlane(context.profile, context.placement, planeFrameFromPlacement(targetPlacement));
  if (!mapped.profile) return { ok: false, reason: mapped.reason ?? 'projection replay could not map a compatible source plane.' };
  return {
    ok: true,
    context: {
      profile: mapped.profile,
      placement: cloneShapeWorkplanePlacement(targetPlacement)!,
    },
  };
}

function projectThroughHoleIntoContext(
  base: ProjectionReplayContext,
  plan: Extract<ShapeCompilePlan, { kind: 'hole' }>,
): ProjectionReplayDerivation {
  const mapped = mapProfileToPlane(
    circleProjectionProfile(holeProjectionRadius(plan)),
    plan.placement,
    planeFrameFromPlacement(base.placement),
  );
  if (!mapped.profile) {
    return {
      ok: false,
      reason: `projection replay can only absorb hole rewrites when the hole axis stays parallel to the projected source basis. ${mapped.reason ?? ''}`.trim(),
    };
  }
  const profile = buildBooleanProfileCompilePlan('difference', [base.profile, mapped.profile]);
  if (!profile) {
    return { ok: false, reason: 'projection replay could not subtract the hole silhouette from the projected source profile.' };
  }
  return {
    ok: true,
    context: {
      profile,
      placement: cloneShapeWorkplanePlacement(base.placement)!,
    },
  };
}

function projectThroughCutIntoContext(
  base: ProjectionReplayContext,
  plan: Extract<ShapeCompilePlan, { kind: 'cut' }>,
): ProjectionReplayDerivation {
  const mapped = mapProfileToPlane(
    plan.profile,
    plan.placement,
    planeFrameFromPlacement(base.placement),
  );
  if (!mapped.profile) {
    return {
      ok: false,
      reason: `projection replay can only absorb cut rewrites when the cut workplane stays parallel to the projected source basis. ${mapped.reason ?? ''}`.trim(),
    };
  }
  const profile = buildBooleanProfileCompilePlan('difference', [base.profile, mapped.profile]);
  if (!profile) {
    return { ok: false, reason: 'projection replay could not subtract the cut silhouette from the projected source profile.' };
  }
  return {
    ok: true,
    context: {
      profile,
      placement: cloneShapeWorkplanePlacement(base.placement)!,
    },
  };
}

function buildProjectionReplayContext(plan: ShapeCompilePlan | null): ProjectionReplayDerivation {
  if (!plan) {
    return { ok: false, reason: 'projection replay currently requires compiler-owned source intent.' };
  }

  switch (plan.kind) {
    case 'queryOwner':
      return buildProjectionReplayContext(plan.base);
    case 'transform': {
      const base = buildProjectionReplayContext(plan.base);
      if (!base.ok) return base;
      let current = cloneProjectionReplayContext(base.context);
      for (const step of plan.steps) {
        if (step.kind === 'workplanePlacement') {
          current.placement = cloneShapeWorkplanePlacement({
            matrix: step.matrix,
            placement: step.placement,
          })!;
          continue;
        }
        current.placement = applyShapeTransformToPlacement(current.placement, step);
      }
      return { ok: true, context: current };
    }
    case 'extrude':
      if (plan.scaleTop) {
        return {
          ok: false,
          reason: 'projection replay currently supports straight extrusions without tapered tops.',
        };
      }
      return { ok: true, context: defaultProjectionContext(plan.profile) };
    case 'box':
      return {
        ok: true,
        context: defaultProjectionContext({
          kind: 'rect',
          width: plan.x,
          height: plan.y,
          center: plan.center,
          transforms: [],
        }),
      };
    case 'cylinder':
      return {
        ok: true,
        context: defaultProjectionContext(circleProjectionProfile(Math.max(Math.abs(plan.radius), Math.abs(plan.radiusTop ?? plan.radius)))),
      };
    case 'shell': {
      const base = buildProjectionReplayContext(plan.base);
      if (!base.ok) return base;
      return { ok: true, context: cloneProjectionReplayContext(base.context) };
    }
    case 'hole': {
      const base = buildProjectionReplayContext(plan.base);
      if (!base.ok) return base;
      if (plan.extent.kind !== 'through') {
        return { ok: true, context: cloneProjectionReplayContext(base.context) };
      }
      return projectThroughHoleIntoContext(base.context, plan);
    }
    case 'cut': {
      const base = buildProjectionReplayContext(plan.base);
      if (!base.ok) return base;
      if (plan.extent.kind !== 'through') {
        return { ok: true, context: cloneProjectionReplayContext(base.context) };
      }
      return projectThroughCutIntoContext(base.context, plan);
    }
    case 'boolean': {
      if (plan.op !== 'union') {
        return {
          ok: false,
          reason: `projection replay currently supports boolean union sources only; boolean ${plan.op} can change shadow coverage along the projection normal.`,
        };
      }
      const operands: ProjectionReplayContext[] = [];
      for (let index = 0; index < plan.shapes.length; index += 1) {
        const derived = buildProjectionReplayContext(plan.shapes[index]);
        if (!derived.ok) {
          return {
            ok: false,
            reason: `projection replay could not derive a compatible union operand at index ${index}: ${derived.reason}`,
          };
        }
        operands.push(derived.context);
      }
      if (operands.length === 0) {
        return { ok: false, reason: 'projection replay cannot derive an empty boolean union source.' };
      }
      const targetPlacement = cloneShapeWorkplanePlacement(operands[0].placement)!;
      const unionProfiles: ProfileCompilePlan[] = [];
      for (let index = 0; index < operands.length; index += 1) {
        const reoriented = reorientProjectionContext(operands[index], targetPlacement);
        if (!reoriented.ok) {
          return {
            ok: false,
            reason: `projection replay could not align union operand ${index} to a shared projection basis: ${reoriented.reason}`,
          };
        }
        unionProfiles.push(reoriented.context.profile);
      }
      const profile = buildBooleanProfileCompilePlan('union', unionProfiles);
      if (!profile) {
        return { ok: false, reason: 'projection replay could not combine the projected union operands into one 2D profile.' };
      }
      return {
        ok: true,
        context: {
          profile,
          placement: targetPlacement,
        },
      };
    }
    case 'sphere':
      return {
        ok: false,
        reason: 'projection replay currently needs a defended planar source basis and does not derive one from spheres yet.',
      };
    case 'sheetMetal':
      return {
        ok: false,
        reason: 'projection replay currently does not derive a defended planar projection basis from sheet-metal semantic bodies yet.',
      };
    case 'revolve':
      return {
        ok: false,
        reason: 'projection replay currently supports projection-driven descendants from extrude/box/cylinder rewrite flows, not revolves.',
      };
    case 'loft':
    case 'sweep':
      return {
        ok: false,
        reason: `projection replay currently does not reduce ${plan.kind} sources to one defended planar projection basis.`,
      };
    case 'hull':
      return {
        ok: false,
        reason: 'projection replay currently does not reduce hull sources to one defended planar projection basis.',
      };
    case 'trimByPlane':
      return {
        ok: false,
        reason: 'projection replay currently does not defend trim-by-plane sources because the kept silhouette depends on the trim half-space.',
      };
    case 'fillet':
    case 'chamfer':
      return {
        ok: false,
        reason: `projection replay currently does not absorb ${plan.kind} silhouette changes into the exact subset.`,
      };
  }
}

export function buildProjectionProfileCompilePlan(
  shape: Shape,
  plane: PlaneSpec,
): ProfileCompilePlan | null {
  const sourceShape = getShapeCompilePlan(shape);
  if (!sourceShape) return null;

  const targetPlane = resolvePlaneFrame(plane);
  const derived = buildProjectionReplayContext(sourceShape);
  if (!derived.ok) {
    return projectionReplayFailure(
      sourceShape,
      targetPlane,
      getShapeWorkplanePlacement(shape)?.placement,
      derived.reason,
    );
  }
  const replay = buildReplayProfile(derived.context.profile, derived.context.placement, targetPlane);
  if (!replay.profile) {
    return projectionReplayFailure(
      sourceShape,
      targetPlane,
      derived.context.placement.placement,
      replay.reason ?? 'projection replay could not derive a supported 2D profile.',
    );
  }

  return {
    kind: 'project',
    sourceShape: cloneShapeCompilePlan(sourceShape)!,
    plane: {
      origin: [targetPlane.origin[0], targetPlane.origin[1], targetPlane.origin[2]],
      u: [targetPlane.u[0], targetPlane.u[1], targetPlane.u[2]],
      v: [targetPlane.v[0], targetPlane.v[1], targetPlane.v[2]],
      normal: [targetPlane.normal[0], targetPlane.normal[1], targetPlane.normal[2]],
    },
    sourcePlacement: cloneSketchPlacementModel(derived.context.placement.placement)!,
    replayProfile: replay.profile,
    transforms: [],
  };
}

import {
  appendProfileCompileTransform,
  cloneProfileCompilePlan,
  cloneShapeCompilePlan,
  type ProfileCompilePlan,
  type ShapeCompilePlan,
} from './compilePlan';
import { getShapeCompilePlan, getShapeWorkplanePlacement, type Shape } from './kernel';
import { resolvePlaneFrame, type PlaneFrame, type PlaneSpec } from './planeFrame';
import { Transform } from './transform';
import { cloneSketchPlacementModel, type ShapeWorkplanePlacement } from './sketch/workplaneModel';

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

function unwrapStraightExtrudeProfile(plan: ShapeCompilePlan | null): ProfileCompilePlan | null {
  if (!plan) return null;
  switch (plan.kind) {
    case 'queryOwner':
    case 'transform':
      return unwrapStraightExtrudeProfile(plan.base);
    case 'extrude':
      if (plan.scaleTop) return null;
      return cloneProfileCompilePlan(plan.profile);
    case 'box':
    case 'cylinder':
    case 'sphere':
    case 'shell':
    case 'hole':
    case 'cut':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'boolean':
    case 'hull':
    case 'trimByPlane':
      return null;
  }
}

function buildReplayProfile(
  profile: ProfileCompilePlan,
  sourcePlacement: ShapeWorkplanePlacement,
  targetPlane: PlaneFrame,
): { profile?: ProfileCompilePlan; reason?: string } {
  const sourceTransform = Transform.from(sourcePlacement.matrix);
  const sourceOrigin = sourceTransform.point([0, 0, 0]);
  const sourceU = sourceTransform.vector([1, 0, 0]);
  const sourceV = sourceTransform.vector([0, 1, 0]);
  const sourceNormal = sourceTransform.vector([0, 0, 1]);

  const normalAlignment = Math.abs(dot(sourceNormal, targetPlane.normal));
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

export function buildProjectionProfileCompilePlan(
  shape: Shape,
  plane: PlaneSpec,
): ProfileCompilePlan | null {
  const sourceShape = getShapeCompilePlan(shape);
  if (!sourceShape) return null;

  const targetPlane = resolvePlaneFrame(plane);
  const sourcePlacement = getShapeWorkplanePlacement(shape);
  if (!sourcePlacement) {
    return projectionReplayFailure(
      sourceShape,
      targetPlane,
      undefined,
      'projection replay currently requires a source shape created from a compiler-visible workplane placement such as Sketch.onFace().',
    );
  }

  const sourceProfile = unwrapStraightExtrudeProfile(sourceShape);
  if (!sourceProfile) {
    return projectionReplayFailure(
      sourceShape,
      targetPlane,
      sourcePlacement.placement,
      'projection replay currently supports straight extrusions without tapered tops or topology-changing downstream features.',
    );
  }

  const replay = buildReplayProfile(sourceProfile, sourcePlacement, targetPlane);
  if (!replay.profile) {
    return projectionReplayFailure(
      sourceShape,
      targetPlane,
      sourcePlacement.placement,
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
    sourcePlacement: cloneSketchPlacementModel(sourcePlacement.placement)!,
    replayProfile: replay.profile,
    transforms: [],
  };
}

import { resolveAnchor3D, type Shape } from '../kernel';
import { Transform, type Mat4, type Vec3 } from '../transform';
import { Sketch, type Anchor, setSketchPlacement3D, getSketchPlacement3D } from './core';
import { TrackedShape, type FaceRef } from './topology';

export type SketchFace3D = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export type SketchFaceTarget = SketchFace3D | string | FaceRef;
type SketchOnFaceOptions = { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor };

type ShapeAnchorTarget = Shape | TrackedShape | { _bbox(): { min: number[]; max: number[] } };

function getSketchAnchorPoint(sketch: Sketch, anchor: Anchor): [number, number] {
  const b = sketch.bounds();
  const [minX, minY] = b.min;
  const [maxX, maxY] = b.max;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  switch (anchor) {
    case 'center': return [cx, cy];
    case 'top-left': return [minX, maxY];
    case 'top-right': return [maxX, maxY];
    case 'bottom-left': return [minX, minY];
    case 'bottom-right': return [maxX, minY];
    case 'top': return [cx, maxY];
    case 'bottom': return [cx, minY];
    case 'left': return [minX, cy];
    case 'right': return [maxX, cy];
  }
}

function resolveTargetFaceCenter(target: ShapeAnchorTarget, face: SketchFace3D): [number, number, number] {
  if (typeof (target as { _bbox?: unknown })._bbox === 'function') {
    const bb = (target as { _bbox(): { min: number[]; max: number[] } })._bbox();
    return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], face);
  }
  const shapeTarget = target as Shape | TrackedShape;
  const shape: Shape = 'toShape' in shapeTarget ? shapeTarget.toShape() : shapeTarget;
  return shape.referencePoint(face);
}

function isCanonicalFace(face: string): face is SketchFace3D {
  return face === 'front'
    || face === 'back'
    || face === 'left'
    || face === 'right'
    || face === 'top'
    || face === 'bottom';
}

function isFaceRef(value: unknown): value is FaceRef {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FaceRef>;
  return typeof candidate.name === 'string'
    && Array.isArray(candidate.normal)
    && Array.isArray(candidate.center);
}

function buildCanonicalFaceBasis(face: SketchFace3D): { u: Vec3; v: Vec3; normal: Vec3 } {
  switch (face) {
    case 'front':
      return { u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] };
    case 'back':
      return { u: [-1, 0, 0], v: [0, 0, 1], normal: [0, 1, 0] };
    case 'left':
      return { u: [0, -1, 0], v: [0, 0, 1], normal: [-1, 0, 0] };
    case 'right':
      return { u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] };
    case 'bottom':
      return { u: [1, 0, 0], v: [0, -1, 0], normal: [0, 0, -1] };
    case 'top':
    default:
      return { u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] };
  }
}

function resolvePlanarFaceBasis(face: FaceRef): { center: Vec3; u: Vec3; v: Vec3; normal: Vec3 } {
  if (face.planar === false || !face.uAxis || !face.vAxis) {
    throw new Error(`Face "${face.name}" is not planar and cannot host a sketch.`);
  }
  return {
    center: [face.center[0], face.center[1], face.center[2]],
    u: [face.uAxis[0], face.uAxis[1], face.uAxis[2]],
    v: [face.vAxis[0], face.vAxis[1], face.vAxis[2]],
    normal: [face.normal[0], face.normal[1], face.normal[2]],
  };
}

function resolveNamedTrackedFace(parent: TrackedShape, face: string): FaceRef | null {
  return parent.topology.faces.get(face) ?? null;
}

function availablePlanarFaceNames(parent: TrackedShape): string[] {
  return parent.faceNames().filter(name => {
    const face = parent.topology.faces.get(name);
    return !!face && face.planar !== false && !!face.uAxis && !!face.vAxis;
  });
}

function resolveFacePlacement(
  parent: ShapeAnchorTarget,
  face: SketchFaceTarget,
): { center: Vec3; u: Vec3; v: Vec3; normal: Vec3 } {
  if (isFaceRef(face)) return resolvePlanarFaceBasis(face);

  if (typeof face !== 'string') {
    throw new Error('Sketch.onFace() requires a face name or FaceRef.');
  }

  if (parent instanceof TrackedShape) {
    const trackedFace = resolveNamedTrackedFace(parent, face);
    if (trackedFace) return resolvePlanarFaceBasis(trackedFace);
  }

  if (isCanonicalFace(face)) {
    const basis = buildCanonicalFaceBasis(face);
    return {
      center: resolveTargetFaceCenter(parent, face),
      u: basis.u,
      v: basis.v,
      normal: basis.normal,
    };
  }

  if (parent instanceof TrackedShape) {
    const available = availablePlanarFaceNames(parent).join(', ') || 'none';
    throw new Error(`Face "${face}" not found or is not planar. Available planar faces: ${available}`);
  }

  throw new Error(`Named face "${face}" requires a TrackedShape parent or a FaceRef target.`);
}

function placementMatrix(basisU: Vec3, basisV: Vec3, normal: Vec3, origin: Vec3): Mat4 {
  return [
    basisU[0], basisU[1], basisU[2], 0,
    basisV[0], basisV[1], basisV[2], 0,
    normal[0], normal[1], normal[2], 0,
    origin[0], origin[1], origin[2], 1,
  ];
}

export function sketchOnFace(
  sketch: Sketch,
  parentOrFace: ShapeAnchorTarget | FaceRef,
  faceOrOpts?: SketchFaceTarget | SketchOnFaceOptions,
  maybeOpts: SketchOnFaceOptions = {},
): Sketch {
  const directFace = isFaceRef(parentOrFace);
  if (directFace && typeof faceOrOpts === 'string') {
    throw new Error('Sketch.onFace(faceRef, opts) accepts options as the second argument, not a face name.');
  }
  if (!directFace && faceOrOpts == null) {
    throw new Error('Sketch.onFace(parent, face, opts) requires a face name or FaceRef.');
  }
  const placement = directFace
    ? resolvePlanarFaceBasis(parentOrFace)
    : resolveFacePlacement(parentOrFace, faceOrOpts as SketchFaceTarget);
  const opts = (directFace ? (faceOrOpts as SketchOnFaceOptions | undefined) : maybeOpts) ?? {};
  const u = opts.u ?? 0;
  const v = opts.v ?? 0;
  const protrude = opts.protrude ?? 0;
  const selfAnchor = opts.selfAnchor ?? 'center';
  const [ax, ay] = getSketchAnchorPoint(sketch, selfAnchor);
  const origin: Vec3 = [
    placement.center[0] + placement.u[0] * u + placement.v[0] * v + placement.normal[0] * protrude,
    placement.center[1] + placement.u[1] * u + placement.v[1] * v + placement.normal[1] * protrude,
    placement.center[2] + placement.u[2] * u + placement.v[2] * v + placement.normal[2] * protrude,
  ];

  const basePlacement = placementMatrix(placement.u, placement.v, placement.normal, origin);
  const anchorOffset = Transform.translation(-ax, -ay, 0);
  return setSketchPlacement3D(sketch.clone(), anchorOffset.mul(basePlacement).toArray());
}

export function getSketchWorldMatrix(sketch: Sketch): Mat4 {
  return getSketchPlacement3D(sketch) ?? Transform.identity().toArray();
}

Sketch.prototype.onFace = function (
  parentOrFace: ShapeAnchorTarget | FaceRef,
  faceOrOpts?: SketchFaceTarget | SketchOnFaceOptions,
  maybeOpts: SketchOnFaceOptions = {},
) {
  return sketchOnFace(this, parentOrFace, faceOrOpts, maybeOpts);
};

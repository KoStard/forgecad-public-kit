import { resolveAnchor3D, type Shape } from '../kernel';
import { Transform, type Mat4, type Vec3 } from '../transform';
import {
  Sketch,
  type Anchor,
  type SketchFace3D,
  type SketchPlacementModel,
  type SketchWorkplane,
} from './core';
import { TrackedShape, type FaceRef } from './topology';

export type ShapeAnchorTarget = Shape | TrackedShape | { _bbox(): { min: number[]; max: number[] } };
export type SketchFaceTarget = SketchFace3D | string | FaceRef;
export type SketchOnFaceOptions = { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor };

function getSketchAnchorPoint(sketch: Sketch, anchor: Anchor): [number, number] {
  const bounds = sketch.bounds();
  const [minX, minY] = bounds.min;
  const [maxX, maxY] = bounds.max;
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

function resolvePlanarFaceWorkplane(face: FaceRef): SketchWorkplane {
  if (face.planar === false || !face.uAxis || !face.vAxis) {
    throw new Error(`Face "${face.name}" is not planar and cannot host a sketch.`);
  }
  return {
    origin: [face.center[0], face.center[1], face.center[2]],
    u: [face.uAxis[0], face.uAxis[1], face.uAxis[2]],
    v: [face.vAxis[0], face.vAxis[1], face.vAxis[2]],
    normal: [face.normal[0], face.normal[1], face.normal[2]],
    source: { kind: 'face-ref', faceName: face.name },
  };
}

function resolveNamedTrackedFace(parent: TrackedShape, face: string): FaceRef | null {
  return parent.topology.faces.get(face) ?? null;
}

function availablePlanarFaceNames(parent: TrackedShape): string[] {
  return parent.faceNames().filter((name) => {
    const face = parent.topology.faces.get(name);
    return !!face && face.planar !== false && !!face.uAxis && !!face.vAxis;
  });
}

export function resolveSketchWorkplane(
  parentOrFace: ShapeAnchorTarget | FaceRef,
  face?: SketchFaceTarget,
): SketchWorkplane {
  if (isFaceRef(parentOrFace)) {
    return resolvePlanarFaceWorkplane(parentOrFace);
  }

  if (face == null) {
    throw new Error('Sketch.onFace(parent, face, opts) requires a face name or FaceRef.');
  }

  if (isFaceRef(face)) {
    return resolvePlanarFaceWorkplane(face);
  }

  if (typeof face !== 'string') {
    throw new Error('Sketch.onFace() requires a face name or FaceRef.');
  }

  if (parentOrFace instanceof TrackedShape) {
    const trackedFace = resolveNamedTrackedFace(parentOrFace, face);
    if (trackedFace) {
      const workplane = resolvePlanarFaceWorkplane(trackedFace);
      return {
        ...workplane,
        source: { kind: 'tracked-face', faceName: face },
      };
    }
  }

  if (isCanonicalFace(face)) {
    const basis = buildCanonicalFaceBasis(face);
    return {
      origin: resolveTargetFaceCenter(parentOrFace, face),
      u: basis.u,
      v: basis.v,
      normal: basis.normal,
      source: { kind: 'canonical-face', face },
    };
  }

  if (parentOrFace instanceof TrackedShape) {
    const available = availablePlanarFaceNames(parentOrFace).join(', ') || 'none';
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

export function buildSketchPlacementMatrix(sketch: Sketch, model: SketchPlacementModel): Mat4 {
  const [anchorX, anchorY] = getSketchAnchorPoint(sketch, model.selfAnchor);
  const origin: Vec3 = [
    model.workplane.origin[0] + model.workplane.u[0] * model.u + model.workplane.v[0] * model.v + model.workplane.normal[0] * model.protrude,
    model.workplane.origin[1] + model.workplane.u[1] * model.u + model.workplane.v[1] * model.v + model.workplane.normal[1] * model.protrude,
    model.workplane.origin[2] + model.workplane.u[2] * model.u + model.workplane.v[2] * model.v + model.workplane.normal[2] * model.protrude,
  ];

  const basePlacement = placementMatrix(model.workplane.u, model.workplane.v, model.workplane.normal, origin);
  const anchorOffset = Transform.translation(-anchorX, -anchorY, 0);
  return anchorOffset.mul(basePlacement).toArray();
}

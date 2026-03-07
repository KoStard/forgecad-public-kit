import { resolveAnchor3D, type Shape } from '../kernel';
import { Transform, type Mat4, type Vec3 } from '../transform';
import { Sketch, type Anchor, setSketchPlacement3D, getSketchPlacement3D } from './core';
import type { TrackedShape } from './topology';

export type SketchFace3D = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

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

function buildFaceBasis(face: SketchFace3D): { u: Vec3; v: Vec3; normal: Vec3 } {
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
  parent: ShapeAnchorTarget,
  face: SketchFace3D,
  opts: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor } = {},
): Sketch {
  const u = opts.u ?? 0;
  const v = opts.v ?? 0;
  const protrude = opts.protrude ?? 0;
  const selfAnchor = opts.selfAnchor ?? 'center';
  const [ax, ay] = getSketchAnchorPoint(sketch, selfAnchor);
  const faceCenter = resolveTargetFaceCenter(parent, face);
  const basis = buildFaceBasis(face);
  const origin: Vec3 = [
    faceCenter[0] + basis.u[0] * u + basis.v[0] * v + basis.normal[0] * protrude,
    faceCenter[1] + basis.u[1] * u + basis.v[1] * v + basis.normal[1] * protrude,
    faceCenter[2] + basis.u[2] * u + basis.v[2] * v + basis.normal[2] * protrude,
  ];

  const basePlacement = placementMatrix(basis.u, basis.v, basis.normal, origin);
  const anchorOffset = Transform.translation(-ax, -ay, 0);
  return setSketchPlacement3D(sketch.clone(), anchorOffset.mul(basePlacement).toArray());
}

export function getSketchWorldMatrix(sketch: Sketch): Mat4 {
  return getSketchPlacement3D(sketch) ?? Transform.identity().toArray();
}

Sketch.prototype.onFace = function (
  parent: ShapeAnchorTarget,
  face: SketchFace3D,
  opts: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor } = {},
) {
  return sketchOnFace(this, parent, face, opts);
};

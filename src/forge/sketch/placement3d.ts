import { type Mat4, Transform } from '../transform';
import { getSketchPlacement3D, Sketch, setSketchPlacement3D, setSketchPlacementModel } from './core';
import type { FaceRef } from './topology';
import {
  buildSketchPlacementMatrix,
  resolveSketchWorkplane,
  type ShapeAnchorTarget,
  type SketchFaceTarget,
  type SketchOnFaceOptions,
} from './workplane';

export type { SketchFace3D } from './core';
export type { ShapeAnchorTarget, SketchFaceTarget, SketchOnFaceOptions } from './workplane';

function isFaceRef(value: unknown): value is FaceRef {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FaceRef>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.normal) && Array.isArray(candidate.center);
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

  const workplane = directFace
    ? resolveSketchWorkplane(parentOrFace as FaceRef)
    : resolveSketchWorkplane(parentOrFace as ShapeAnchorTarget, faceOrOpts as SketchFaceTarget);
  const opts = (directFace ? (faceOrOpts as SketchOnFaceOptions | undefined) : maybeOpts) ?? {};
  const model = {
    workplane,
    u: opts.u ?? 0,
    v: opts.v ?? 0,
    protrude: opts.protrude ?? 0,
    selfAnchor: opts.selfAnchor ?? 'center',
  } as const;

  return setSketchPlacementModel(setSketchPlacement3D(sketch.clone(), buildSketchPlacementMatrix(sketch, model)), model);
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

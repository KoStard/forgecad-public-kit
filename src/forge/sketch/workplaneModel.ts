import { cloneFaceQueryRef, type FaceQueryRef } from '../queryModel';
import type { Mat4 } from '../transform';

export type Anchor = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';

export type SketchWorkplaneSource = FaceQueryRef;
export type { FaceQueryRef, ShapeQueryOwner, SketchFace3D } from '../queryModel';

export interface SketchWorkplane {
  origin: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  normal: [number, number, number];
  source: SketchWorkplaneSource;
}

export interface SketchPlacementModel {
  workplane: SketchWorkplane;
  u: number;
  v: number;
  protrude: number;
  selfAnchor: Anchor;
}

export interface ShapeWorkplanePlacement {
  matrix: Mat4;
  placement: SketchPlacementModel;
}

export function cloneSketchWorkplaneSource(source: SketchWorkplaneSource): SketchWorkplaneSource {
  return cloneFaceQueryRef(source)!;
}

export function cloneSketchWorkplane(workplane: SketchWorkplane): SketchWorkplane {
  return {
    origin: [workplane.origin[0], workplane.origin[1], workplane.origin[2]],
    u: [workplane.u[0], workplane.u[1], workplane.u[2]],
    v: [workplane.v[0], workplane.v[1], workplane.v[2]],
    normal: [workplane.normal[0], workplane.normal[1], workplane.normal[2]],
    source: cloneSketchWorkplaneSource(workplane.source),
  };
}

export function cloneSketchPlacementModel(model: SketchPlacementModel | null): SketchPlacementModel | null {
  if (!model) return null;
  return {
    workplane: cloneSketchWorkplane(model.workplane),
    u: model.u,
    v: model.v,
    protrude: model.protrude,
    selfAnchor: model.selfAnchor,
  };
}

export function cloneMat4(matrix: Mat4): Mat4 {
  return [...matrix] as Mat4;
}

export function cloneShapeWorkplanePlacement(placement: ShapeWorkplanePlacement | null): ShapeWorkplanePlacement | null {
  if (!placement) return null;
  return {
    matrix: cloneMat4(placement.matrix),
    placement: cloneSketchPlacementModel(placement.placement)!,
  };
}

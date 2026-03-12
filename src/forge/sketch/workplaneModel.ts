import type { Mat4 } from '../transform';

export type Anchor =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right';

export type SketchFace3D = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface ShapeQueryOwner {
  id: string;
  operation: string;
}

export type SketchWorkplaneSource =
  | { kind: 'canonical-face'; face: SketchFace3D; owner?: ShapeQueryOwner }
  | { kind: 'tracked-face'; faceName: string; owner?: ShapeQueryOwner }
  | { kind: 'face-ref'; faceName?: string; owner?: ShapeQueryOwner };

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

export function cloneShapeQueryOwner(owner: ShapeQueryOwner | undefined): ShapeQueryOwner | undefined {
  if (!owner) return undefined;
  return {
    id: owner.id,
    operation: owner.operation,
  };
}

export function cloneSketchWorkplaneSource(source: SketchWorkplaneSource): SketchWorkplaneSource {
  switch (source.kind) {
    case 'canonical-face':
      return { kind: 'canonical-face', face: source.face, owner: cloneShapeQueryOwner(source.owner) };
    case 'tracked-face':
      return { kind: 'tracked-face', faceName: source.faceName, owner: cloneShapeQueryOwner(source.owner) };
    case 'face-ref':
      return { kind: 'face-ref', faceName: source.faceName, owner: cloneShapeQueryOwner(source.owner) };
  }
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

export function cloneShapeWorkplanePlacement(
  placement: ShapeWorkplanePlacement | null,
): ShapeWorkplanePlacement | null {
  if (!placement) return null;
  return {
    matrix: cloneMat4(placement.matrix),
    placement: cloneSketchPlacementModel(placement.placement)!,
  };
}

import type { ResolvedEdgeFeatureSelection } from './edgeFeatureModel';
import type { EdgeQueryRef, FaceQueryRef } from './queryModel';
import type { FaceRef } from './sketch/topology';

export type FaceDescendantSemantic = 'face' | 'region' | 'set';

export interface FaceDescendantMetadata {
  kind: 'single' | 'face-set';
  semantic: FaceDescendantSemantic;
  memberCount: number;
  memberNames: string[];
  coplanar: boolean;
}

export interface FaceDescendantMember {
  name: string;
  face: FaceRef;
}

export interface SingleFaceDescendantResolution {
  kind: 'single';
  semantic: 'face';
  name: string;
  query?: FaceQueryRef;
  face: FaceRef;
  members: FaceDescendantMember[];
  note?: string;
}

export interface FaceSetDescendantResolution {
  kind: 'face-set';
  semantic: 'region' | 'set';
  name: string;
  query?: FaceQueryRef;
  face: FaceRef;
  members: FaceDescendantMember[];
  coplanar: boolean;
  note?: string;
}

export interface UnsupportedFaceDescendantResolution {
  kind: 'unsupported';
  name: string;
  query?: FaceQueryRef;
  reason: string;
  note?: string;
}

export type ShapeFaceDescendantResolution =
  | SingleFaceDescendantResolution
  | FaceSetDescendantResolution
  | UnsupportedFaceDescendantResolution;

export interface SingleEdgeDescendantResolution {
  kind: 'single';
  semantic: 'edge';
  query: EdgeQueryRef;
  selection: ResolvedEdgeFeatureSelection;
  note?: string;
}

export interface EdgeChainDescendantResolution {
  kind: 'edge-chain';
  semantic: 'chain';
  query: EdgeQueryRef;
  selection?: ResolvedEdgeFeatureSelection;
  note?: string;
}

export interface UnsupportedEdgeDescendantResolution {
  kind: 'unsupported';
  query?: EdgeQueryRef;
  reason: string;
  note?: string;
}

export type ShapeEdgeDescendantResolution =
  | SingleEdgeDescendantResolution
  | EdgeChainDescendantResolution
  | UnsupportedEdgeDescendantResolution;

export interface VertexSetDescendantResolution {
  kind: 'vertex-set';
  note?: string;
}

export interface UnsupportedVertexDescendantResolution {
  kind: 'unsupported';
  reason: string;
  note?: string;
}

export type ShapeVertexDescendantResolution =
  | VertexSetDescendantResolution
  | UnsupportedVertexDescendantResolution;

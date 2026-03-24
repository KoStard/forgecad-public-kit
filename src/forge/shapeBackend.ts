import type { Mat4 } from './transform';

export const SHAPE_BACKEND_MARKER = Symbol.for('forgecad.shapeBackend');

/**
 * Runtime bounding box — axis-aligned min/max corners.
 */
export interface ShapeRuntimeBounds {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

/**
 * Runtime triangle mesh — the common exchange format produced by all backends.
 * Contains indexed triangles with per-vertex properties (position + optional normals/UVs).
 */
export interface ShapeRuntimeMesh {
  readonly numProp: number;
  readonly numTri: number;
  readonly triVerts: Uint32Array;
  readonly vertProperties: Float32Array;
  readonly numVert?: number;
  readonly mergeFromVert?: Uint32Array;
  readonly mergeToVert?: Uint32Array;
  readonly runIndex?: Uint32Array;
  readonly runOriginalID?: Uint32Array;
  readonly runTransform?: Float32Array;
  readonly faceID?: Uint32Array | Int32Array;
  readonly halfedgeTangent?: Float32Array;
}

/**
 * Runtime 2D cross-section — opaque handle to a backend-specific 2D profile.
 * Code that needs backend-specific APIs should cast through the backend layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShapeRuntimeCrossSection = any;

/** Geometric description of an edge to fillet/chamfer, backend-agnostic. */
export interface EdgeFeatureTarget {
  midpoint: [number, number, number];
  start: [number, number, number];
  end: [number, number, number];
  convex: boolean;
}

export interface ShapeBackend {
  readonly [SHAPE_BACKEND_MARKER]: true;

  clone(): ShapeBackend;
  translate(x: number, y: number, z: number): ShapeBackend;
  rotate(x: number, y: number, z: number): ShapeBackend;
  transform(m: Mat4): ShapeBackend;
  scale(v: number | [number, number, number]): ShapeBackend;
  mirror(normal: [number, number, number]): ShapeBackend;
  split(other: ShapeBackend): [ShapeBackend, ShapeBackend];
  splitByPlane(normal: [number, number, number], originOffset: number): [ShapeBackend, ShapeBackend];
  trimByPlane(normal: [number, number, number], originOffset: number): ShapeBackend;
  boundingBox(): ShapeRuntimeBounds;
  volume(): number;
  surfaceArea(): number;
  isEmpty(): boolean;
  numTri(): number;
  getMesh(): ShapeRuntimeMesh;
  slice(offset: number): ShapeRuntimeCrossSection;
  project(): ShapeRuntimeCrossSection;
}

export function isShapeBackend(value: unknown): value is ShapeBackend {
  return Boolean(value && typeof value === 'object' && (value as Record<PropertyKey, unknown>)[SHAPE_BACKEND_MARKER] === true);
}

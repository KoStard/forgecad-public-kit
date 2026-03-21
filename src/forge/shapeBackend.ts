import type { Mat4 } from './transform';

export const SHAPE_BACKEND_MARKER = Symbol.for('forgecad.shapeBackend');

/**
 * Runtime bounding box — structurally matches Manifold's boundingBox() return.
 * Defined here so shapeBackend.ts has no manifold-3d import.
 */
export interface ShapeRuntimeBounds {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

/**
 * Runtime triangle mesh — structurally matches Manifold's getMesh() return.
 * Backends produce this; consumers that need the full Manifold Mesh type
 * should cast in the backend-specific layer.
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
 * Runtime 2D cross-section — opaque handle.
 * In Manifold backend this is a CrossSection instance; in OCCT it may differ.
 * Code that needs CrossSection-specific APIs should import and cast through
 * the backend layer. Typed as `any` to avoid leaking manifold-3d into the
 * backend-agnostic contract.
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
  smoothOut(minSharpAngle: number, minSmoothness: number): ShapeBackend;
  refine(steps: number): ShapeBackend;
  refineToLength(length: number): ShapeBackend;
  refineToTolerance(tolerance: number): ShapeBackend;
  warp(fn: (vert: [number, number, number]) => void): ShapeBackend;
  split(other: ShapeBackend): [ShapeBackend, ShapeBackend];
  splitByPlane(normal: [number, number, number], originOffset: number): [ShapeBackend, ShapeBackend];
  trimByPlane(normal: [number, number, number], originOffset: number): ShapeBackend;
  hull(): ShapeBackend;
  simplify(tolerance?: number): ShapeBackend;
  boundingBox(): ShapeRuntimeBounds;
  volume(): number;
  surfaceArea(): number;
  minGap(other: ShapeBackend, searchLength: number): number;
  isEmpty(): boolean;
  numTri(): number;
  getMesh(): ShapeRuntimeMesh;
  slice(offset: number): ShapeRuntimeCrossSection;
  project(): ShapeRuntimeCrossSection;
}

export function isShapeBackend(value: unknown): value is ShapeBackend {
  return Boolean(value && typeof value === 'object' && (value as Record<PropertyKey, unknown>)[SHAPE_BACKEND_MARKER] === true);
}

// Re-exports from backends/manifold for backward compatibility
export { ManifoldShapeBackend, wrapManifoldShapeBackend } from './backends/manifold/shapeBackend';
export { isManifoldCapableBackend, type ManifoldCapableBackend } from './backends/manifold/shapeBackend';

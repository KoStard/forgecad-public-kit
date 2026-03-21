import type { Manifold } from 'manifold-3d';
import type { Mat4 } from './transform';

export const SHAPE_BACKEND_MARKER = Symbol.for('forgecad.shapeBackend');

export type ShapeRuntimeBounds = ReturnType<Manifold['boundingBox']>;
export type ShapeRuntimeMesh = ReturnType<Manifold['getMesh']>;
export type ShapeRuntimeCrossSection = ReturnType<Manifold['slice']>;

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
  requireManifold(apiName?: string): Manifold;
}

export function isShapeBackend(value: unknown): value is ShapeBackend {
  return Boolean(value && typeof value === 'object' && (value as Record<PropertyKey, unknown>)[SHAPE_BACKEND_MARKER] === true);
}

// Re-exports from backends/manifold for backward compatibility
export { ManifoldShapeBackend, wrapManifoldShapeBackend, requireManifoldShapeBackend } from './backends/manifold/shapeBackend';

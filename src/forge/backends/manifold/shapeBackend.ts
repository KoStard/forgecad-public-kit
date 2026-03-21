import type { Manifold } from 'manifold-3d';
import type { Mat4 } from '../../transform';
import {
  SHAPE_BACKEND_MARKER,
  type ShapeBackend,
  type ShapeRuntimeBounds,
  type ShapeRuntimeMesh,
  type ShapeRuntimeCrossSection,
} from '../../shapeBackend';

export class ManifoldShapeBackend implements ShapeBackend {
  readonly [SHAPE_BACKEND_MARKER] = true as const;

  constructor(private readonly manifold: Manifold) {}

  clone(): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold);
  }

  translate(x: number, y: number, z: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.translate(x, y, z));
  }

  rotate(x: number, y: number, z: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.rotate(x, y, z));
  }

  transform(m: Mat4): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.transform(m));
  }

  scale(v: number | [number, number, number]): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.scale(v as any));
  }

  mirror(normal: [number, number, number]): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.mirror(normal));
  }

  smoothOut(minSharpAngle: number, minSmoothness: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.smoothOut(minSharpAngle, minSmoothness));
  }

  refine(steps: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.refine(steps));
  }

  refineToLength(length: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.refineToLength(length));
  }

  refineToTolerance(tolerance: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.refineToTolerance(tolerance));
  }

  warp(fn: (vert: [number, number, number]) => void): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.warp(fn as any));
  }

  split(other: ShapeBackend): [ShapeBackend, ShapeBackend] {
    const [inside, outside] = this.manifold.split(requireManifoldShapeBackend(other, 'ShapeBackend.split()'));
    return [new ManifoldShapeBackend(inside), new ManifoldShapeBackend(outside)];
  }

  splitByPlane(normal: [number, number, number], originOffset: number): [ShapeBackend, ShapeBackend] {
    const [inside, outside] = this.manifold.splitByPlane(normal, originOffset);
    return [new ManifoldShapeBackend(inside), new ManifoldShapeBackend(outside)];
  }

  trimByPlane(normal: [number, number, number], originOffset: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.trimByPlane(normal, originOffset));
  }

  hull(): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.hull());
  }

  simplify(tolerance?: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.simplify(tolerance));
  }

  boundingBox(): ShapeRuntimeBounds {
    return this.manifold.boundingBox();
  }

  volume(): number {
    return this.manifold.volume();
  }

  surfaceArea(): number {
    return this.manifold.surfaceArea();
  }

  minGap(other: ShapeBackend, searchLength: number): number {
    return this.manifold.minGap(requireManifoldShapeBackend(other, 'ShapeBackend.minGap()'), searchLength);
  }

  isEmpty(): boolean {
    return this.manifold.isEmpty();
  }

  numTri(): number {
    return this.manifold.numTri();
  }

  getMesh(): ShapeRuntimeMesh {
    return this.manifold.getMesh();
  }

  slice(offset: number): ShapeRuntimeCrossSection {
    return this.manifold.slice(offset);
  }

  project(): ShapeRuntimeCrossSection {
    return this.manifold.project();
  }

  requireManifold(): Manifold {
    return this.manifold;
  }
}

export function wrapManifoldShapeBackend(manifold: Manifold): ShapeBackend {
  return new ManifoldShapeBackend(manifold);
}

export function requireManifoldShapeBackend(backend: ShapeBackend, apiName = 'requireManifoldShapeBackend()'): Manifold {
  try {
    return backend.requireManifold(apiName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${apiName} currently requires a Manifold-backed runtime shape. ${message}`);
  }
}

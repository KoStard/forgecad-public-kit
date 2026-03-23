import type { Manifold } from 'manifold-3d';
import type { Mat4 } from '../../transform';
import {
  SHAPE_BACKEND_MARKER,
  type ShapeBackend,
  type ShapeRuntimeBounds,
  type ShapeRuntimeMesh,
  type ShapeRuntimeCrossSection,
} from '../../shapeBackend';
import { getWasm } from './wasm';

/**
 * A ShapeBackend that can provide a raw Manifold object.
 * Only ManifoldShapeBackend implements this directly.
 */
export interface ManifoldCapableBackend extends ShapeBackend {
  requireManifold(apiName?: string): Manifold;
}

/** Type guard: does this backend support direct Manifold access? */
export function isManifoldCapableBackend(b: ShapeBackend): b is ManifoldCapableBackend {
  return typeof (b as ManifoldCapableBackend).requireManifold === 'function';
}

export class ManifoldShapeBackend implements ManifoldCapableBackend {
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

  simplify(tolerance?: number): ShapeBackend {
    return new ManifoldShapeBackend(this.manifold.simplify(tolerance));
  }

  boundingBox(): ShapeRuntimeBounds {
    return this.manifold.boundingBox() as unknown as ShapeRuntimeBounds;
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
    return this.manifold.getMesh() as unknown as ShapeRuntimeMesh;
  }

  slice(offset: number): ShapeRuntimeCrossSection {
    return this.manifold.slice(offset) as unknown as ShapeRuntimeCrossSection;
  }

  project(): ShapeRuntimeCrossSection {
    return this.manifold.project() as unknown as ShapeRuntimeCrossSection;
  }

  requireManifold(): Manifold {
    return this.manifold;
  }
}

export function wrapManifoldShapeBackend(manifold: Manifold): ShapeBackend {
  return new ManifoldShapeBackend(manifold);
}

/**
 * Reconstruct a ShapeBackend from pre-computed mesh data using the Manifold backend.
 *
 * This is used by FrozenShapeBackend to lazily thaw a shape when geometric
 * operations are requested. Manifold is always used for reconstruction because
 * it can construct a solid directly from a triangle mesh, whereas OCCT requires
 * B-rep topology (faces, edges, wires) that cannot be recovered from triangles
 * alone.
 */
export function reconstructBackendFromMesh(mesh: {
  numProp: number;
  triVerts: Uint32Array;
  vertProperties: Float32Array;
  mergeFromVert: Uint32Array;
  mergeToVert: Uint32Array;
}): ShapeBackend {
  const wasm = getWasm();
  const wasmMesh = new wasm.Mesh({
    numProp: mesh.numProp,
    triVerts: mesh.triVerts,
    vertProperties: mesh.vertProperties,
    mergeFromVert: mesh.mergeFromVert.length > 0 ? mesh.mergeFromVert : undefined,
    mergeToVert: mesh.mergeToVert.length > 0 ? mesh.mergeToVert : undefined,
  });
  let manifold;
  try {
    manifold = new wasm.Manifold(wasmMesh);
  } catch {
    manifold = wasm.Manifold.cube([0, 0, 0]);
  }
  return new ManifoldShapeBackend(manifold);
}

export function requireManifoldShapeBackend(backend: ShapeBackend, apiName = 'requireManifoldShapeBackend()'): Manifold {
  if (isManifoldCapableBackend(backend)) {
    return backend.requireManifold(apiName);
  }
  throw new Error(`${apiName} currently requires a Manifold-backed runtime shape.`);
}

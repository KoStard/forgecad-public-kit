/**
 * ForgeCAD — FrozenShape
 *
 * A Shape subclass that uses pre-computed mesh and face data transferred from
 * the eval worker. The underlying ShapeBackend is lazy — it answers getMesh(),
 * boundingBox(), isEmpty(), and numTri() from cached data with zero WASM calls.
 * A real Manifold is only reconstructed on demand, when geometric operations
 * like splitByPlane() are actually needed (e.g. cut planes).
 */

import { Shape, getWasm } from './kernel';
import type { ShapeBackend, ShapeRuntimeBounds, ShapeRuntimeMesh, ShapeRuntimeCrossSection } from './shapeBackend';
import { ManifoldShapeBackend, SHAPE_BACKEND_MARKER } from './shapeBackend';
import type { FaceRef } from './sketch/topology';
import type { FaceTransformationHistory } from './faceHistory';
import type { GeometryInfo } from './kernel';
import type { SerializedShapeData } from '../workers/evalWorkerProtocol';

/**
 * A ShapeBackend that serves rendering data from cached TypedArrays and only
 * builds a real Manifold when an actual geometric operation is requested.
 */
class FrozenShapeBackend implements ShapeBackend {
  readonly [SHAPE_BACKEND_MARKER] = true as const;

  private readonly _data: SerializedShapeData;
  private _manifoldBackend: ShapeBackend | null = null;

  constructor(data: SerializedShapeData) {
    this._data = data;
  }

  private getManifoldBackend(): ShapeBackend {
    if (!this._manifoldBackend) {
      const wasm = getWasm();
      const data = this._data;
      const wasmMesh = new wasm.Mesh({
        numProp: data.meshNumProp,
        triVerts: data.meshTriVerts,
        vertProperties: data.meshVertProperties,
        mergeFromVert: data.meshMergeFromVert.length > 0 ? data.meshMergeFromVert : undefined,
        mergeToVert: data.meshMergeToVert.length > 0 ? data.meshMergeToVert : undefined,
      });
      let manifold;
      try {
        manifold = new wasm.Manifold(wasmMesh);
      } catch {
        manifold = wasm.Manifold.cube([0, 0, 0]);
      }
      this._manifoldBackend = new ManifoldShapeBackend(manifold);
    }
    return this._manifoldBackend;
  }

  // --- Served from cache — no WASM ---

  getMesh(): ShapeRuntimeMesh {
    return {
      numProp: this._data.meshNumProp,
      numTri: this._data.numTriangles,
      triVerts: this._data.meshTriVerts,
      vertProperties: this._data.meshVertProperties,
      mergeFromVert: new Uint32Array(0),
      mergeToVert: new Uint32Array(0),
      runIndex: new Uint32Array(0),
      runOriginalID: new Uint32Array(0),
      runTransform: new Float32Array(0),
      faceID: new Int32Array(0),
      halfedgeTangent: new Float32Array(0),
    } as unknown as ShapeRuntimeMesh;
  }

  boundingBox(): ShapeRuntimeBounds {
    const bb = this._data.boundingBox;
    return { min: bb.min, max: bb.max } as ShapeRuntimeBounds;
  }

  isEmpty(): boolean {
    return this._data.numTriangles === 0;
  }

  numTri(): number {
    return this._data.numTriangles;
  }

  // --- Delegated to lazy Manifold ---

  clone(): ShapeBackend { return this.getManifoldBackend().clone(); }
  translate(x: number, y: number, z: number): ShapeBackend { return this.getManifoldBackend().translate(x, y, z); }
  rotate(x: number, y: number, z: number): ShapeBackend { return this.getManifoldBackend().rotate(x, y, z); }
  transform(m: Parameters<ShapeBackend['transform']>[0]): ShapeBackend { return this.getManifoldBackend().transform(m); }
  scale(v: number | [number, number, number]): ShapeBackend { return this.getManifoldBackend().scale(v); }
  mirror(normal: [number, number, number]): ShapeBackend { return this.getManifoldBackend().mirror(normal); }
  smoothOut(minSharpAngle: number, minSmoothness: number): ShapeBackend { return this.getManifoldBackend().smoothOut(minSharpAngle, minSmoothness); }
  refine(steps: number): ShapeBackend { return this.getManifoldBackend().refine(steps); }
  refineToLength(length: number): ShapeBackend { return this.getManifoldBackend().refineToLength(length); }
  refineToTolerance(tolerance: number): ShapeBackend { return this.getManifoldBackend().refineToTolerance(tolerance); }
  warp(fn: (vert: [number, number, number]) => void): ShapeBackend { return this.getManifoldBackend().warp(fn); }
  split(other: ShapeBackend): [ShapeBackend, ShapeBackend] { return this.getManifoldBackend().split(other); }
  splitByPlane(normal: [number, number, number], originOffset: number): [ShapeBackend, ShapeBackend] { return this.getManifoldBackend().splitByPlane(normal, originOffset); }
  trimByPlane(normal: [number, number, number], originOffset: number): ShapeBackend { return this.getManifoldBackend().trimByPlane(normal, originOffset); }
  hull(): ShapeBackend { return this.getManifoldBackend().hull(); }
  simplify(tolerance?: number): ShapeBackend { return this.getManifoldBackend().simplify(tolerance); }
  volume(): number { return this.getManifoldBackend().volume(); }
  surfaceArea(): number { return this.getManifoldBackend().surfaceArea(); }
  minGap(other: ShapeBackend, searchLength: number): number { return this.getManifoldBackend().minGap(other, searchLength); }
  slice(offset: number): ShapeRuntimeCrossSection { return this.getManifoldBackend().slice(offset); }
  project(): ShapeRuntimeCrossSection { return this.getManifoldBackend().project(); }
  requireManifold(apiName?: string): ReturnType<ShapeBackend['requireManifold']> { return this.getManifoldBackend().requireManifold(apiName); }
}

export class FrozenShape extends Shape {
  private readonly _faceNames: string[];
  private readonly _faces: Record<string, FaceRef>;
  private readonly _faceHistories: Record<string, FaceTransformationHistory>;

  constructor(data: SerializedShapeData) {
    super(new FrozenShapeBackend(data), data.colorHex ?? undefined, data.geometryInfo ?? undefined);
    this._faceNames = data.faceNames;
    this._faces = data.faces;
    this._faceHistories = data.faceHistories;
  }

  override getMesh() {
    // Delegate to FrozenShapeBackend.getMesh() via the backend WeakMap path,
    // but Shape.getMesh() already calls getShapeRuntimeBackendInternal(this).getMesh()
    // so this override is kept only for the type cast.
    return super.getMesh();
  }

  override faceNames(): string[] {
    return this._faceNames;
  }

  override face(name: string): FaceRef {
    const faceRef = this._faces[name];
    if (!faceRef) throw new Error(`Face '${name}' not found on frozen shape`);
    return faceRef;
  }

  override faceHistory(name: string): FaceTransformationHistory {
    const history = this._faceHistories[name];
    if (!history) throw new Error(`Face history for '${name}' not found`);
    return history;
  }
}

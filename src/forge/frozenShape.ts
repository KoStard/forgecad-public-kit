/**
 * ForgeCAD — FrozenShape
 *
 * A Shape subclass that uses pre-computed mesh and face data transferred from
 * the eval worker. Extends Shape so all WASM geometric operations (splitByPlane,
 * isEmpty, etc.) still work via a reconstructed Manifold — but face metadata
 * methods return cached data without additional WASM calls.
 */

import { Shape, getWasm } from './kernel';
import type { FaceRef } from './sketch/topology';
import type { FaceTransformationHistory } from './faceHistory';
import type { GeometryInfo } from './kernel';
import type { SerializedShapeData } from '../workers/evalWorkerProtocol';

export class FrozenShape extends Shape {
  private readonly _meshData: Pick<SerializedShapeData,
    | 'meshNumProp' | 'meshTriVerts' | 'meshVertProperties'
    | 'boundingBox' | 'numTriangles'
  >;
  private readonly _faceNames: string[];
  private readonly _faces: Record<string, FaceRef>;
  private readonly _faceHistories: Record<string, FaceTransformationHistory>;

  constructor(data: SerializedShapeData) {
    const wasm = getWasm();

    // Reconstruct a Manifold from the transferred mesh data.
    // This gives us a fully functional WASM-backed shape for geometric ops
    // (splitByPlane, isEmpty, boundingBox, etc.) while keeping the pre-cached
    // metadata for face-related queries.
    const wasmMesh = new wasm.Mesh({
      numProp: data.meshNumProp,
      triVerts: data.meshTriVerts,
      vertProperties: data.meshVertProperties,
      mergeFromVert: data.meshMergeFromVert.length > 0 ? data.meshMergeFromVert : undefined,
      mergeToVert: data.meshMergeToVert.length > 0 ? data.meshMergeToVert : undefined,
    });

    let manifold: InstanceType<typeof wasm.Manifold>;
    try {
      manifold = new wasm.Manifold(wasmMesh);
    } catch {
      // If reconstruction fails (degenerate mesh), use an empty manifold
      manifold = wasm.Manifold.cube([0, 0, 0]);
    }

    super(manifold, data.colorHex ?? undefined, data.geometryInfo ?? undefined);

    this._meshData = {
      meshNumProp: data.meshNumProp,
      meshTriVerts: data.meshTriVerts,
      meshVertProperties: data.meshVertProperties,
      boundingBox: data.boundingBox,
      numTriangles: data.numTriangles,
    };
    this._faceNames = data.faceNames;
    this._faces = data.faces;
    this._faceHistories = data.faceHistories;
  }

  /**
   * Returns a synthetic mesh using the pre-extracted TypedArrays.
   * shapeToGeometry() on the main thread will use this to build Three.js geometry
   * without any additional WASM calls.
   */
  override getMesh() {
    return {
      numProp: this._meshData.meshNumProp,
      numTri: this._meshData.numTriangles,
      triVerts: this._meshData.meshTriVerts,
      vertProperties: this._meshData.meshVertProperties,
      // Optional fields — not needed by shapeToGeometry
      mergeFromVert: new Uint32Array(0),
      mergeToVert: new Uint32Array(0),
      runIndex: new Uint32Array(0),
      runOriginalID: new Uint32Array(0),
      runTransform: new Float32Array(0),
      faceID: new Int32Array(0),
      halfedgeTangent: new Float32Array(0),
    } as unknown as ReturnType<Shape['getMesh']>;
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

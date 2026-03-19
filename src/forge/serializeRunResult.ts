/**
 * ForgeCAD — RunResult Serializer
 *
 * Extracts all display data from a RunResult's WASM-backed Shape/Sketch objects
 * into plain, transferable structures that can be sent via postMessage.
 * Runs inside the eval worker.
 */

import type { RunResult, SceneObject } from './runner';
import { getSketchPlacement3D } from './sketch/core';
import { isConstraintSketch, ConstraintSketch } from './sketch/constraints';
import { computeGeometryArrays } from './geometryArrays';
import { getShapeCompilePlan } from './kernel';
import type { SolverWasmRunDebugSnapshot } from './sketch/constraints/solver-wasm';
import type {
  SerializedRunResult,
  SerializedSceneObject,
  SerializedShapeData,
  SerializedSketchData,
} from '../workers/evalWorkerProtocol';

interface ShapeTimings {
  getMeshMs: number;
  copyMs: number;
  bbMs: number;
  geomArraysMs: number;
  sketchMs: number;
}

function serializeShape(obj: SceneObject, timings: ShapeTimings): SerializedShapeData | null {
  const { shape } = obj;
  if (!shape) return null;

  try {
    let t = performance.now();
    const rawMesh = shape.getMesh();
    timings.getMeshMs += performance.now() - t;

    t = performance.now();
    const meshTriVerts = new Uint32Array(rawMesh.triVerts);
    const meshVertProperties = new Float32Array(rawMesh.vertProperties);
    const meshMergeFromVert = new Uint32Array(rawMesh.mergeFromVert ?? new Uint32Array(0));
    const meshMergeToVert = new Uint32Array(rawMesh.mergeToVert ?? new Uint32Array(0));
    timings.copyMs += performance.now() - t;

    t = performance.now();
    const bb = shape.boundingBox();
    timings.bbMs += performance.now() - t;

    const boundingBox = {
      min: [bb.min[0], bb.min[1], bb.min[2]] as [number, number, number],
      max: [bb.max[0], bb.max[1], bb.max[2]] as [number, number, number],
    };

    // Face names, refs, and histories are only needed for the face info panel
    // (right-click → face info). Skip during serialization — computed on demand
    // via a separate worker request when the panel is opened.
    const faceNames: string[] = [];
    const faces: SerializedShapeData['faces'] = {};
    const faceHistories: SerializedShapeData['faceHistories'] = {};

    const numTriangles = shape.numTri();

    const tGeom = performance.now();
    const { positions: geometryPositions, normals: geometryNormals, edgePositions: geometryEdgePositions } =
      computeGeometryArrays({
        numProp: rawMesh.numProp,
        numTri: numTriangles,
        triVerts: meshTriVerts,
        vertProperties: meshVertProperties,
        mergeFromVert: meshMergeFromVert.length > 0 ? meshMergeFromVert : undefined,
        mergeToVert: meshMergeToVert.length > 0 ? meshMergeToVert : undefined,
      });
    timings.geomArraysMs += performance.now() - tGeom;

    return {
      meshNumProp: rawMesh.numProp,
      meshTriVerts,
      meshVertProperties,
      meshMergeFromVert,
      meshMergeToVert,
      boundingBox,
      numTriangles,
      faceNames,
      faces,
      faceHistories,
      colorHex: shape.colorHex ?? null,
      geometryInfo: obj.geometryInfo ?? null,
      geometryPositions,
      geometryNormals,
      geometryEdgePositions,
    };
  } catch {
    return null;
  }
}

function serializeSketch(obj: SceneObject): SerializedSketchData | null {
  const { sketch } = obj;
  if (!sketch) return null;

  try {
    const polygons = sketch.toPolygons() as [number, number][][];
    const rawBounds = sketch.bounds();
    const bounds = {
      min: [rawBounds.min[0], rawBounds.min[1]] as [number, number],
      max: [rawBounds.max[0], rawBounds.max[1]] as [number, number],
    };
    const placement = getSketchPlacement3D(sketch);
    const worldMatrix = placement ? [...placement] : null;

    const data: SerializedSketchData = {
      polygons,
      bounds,
      worldMatrix,
      colorHex: sketch.colorHex,
    };

    if (isConstraintSketch(sketch)) {
      data.constraintMeta = sketch.constraintMeta;
      data.constraintDefinition = sketch.definition;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Extract all transferable data from a RunResult.
 * Returns the serialized result AND a list of all TypedArray buffers
 * that should be transferred (zero-copy) via postMessage.
 */
export function serializeRunResult(
  result: RunResult,
  solverDebug: SolverWasmRunDebugSnapshot | null = null,
): {
  serialized: SerializedRunResult;
  transferables: Transferable[];
} {
  const transferables: Transferable[] = [];
  const timings: ShapeTimings = { getMeshMs: 0, copyMs: 0, bbMs: 0, geomArraysMs: 0, sketchMs: 0 };

  const objects = result.objects.map((obj) => {
    const shapeData = serializeShape(obj, timings);
    const tSketch = performance.now();
    const sketchData = serializeSketch(obj);
    timings.sketchMs += performance.now() - tSketch;
    const serialized: SerializedSceneObject = {
      id: obj.id,
      name: obj.name,
      shapeData,
      sketchData,
      compilePlan: obj.shape ? getShapeCompilePlan(obj.shape) : null,
      color: obj.color,
      geometryInfo: obj.geometryInfo,
      sketchMeta: (obj as any).sketchMeta,
      groupName: obj.groupName,
      treePath: obj.treePath,
    };
    if (serialized.shapeData) {
      transferables.push(
        serialized.shapeData.meshTriVerts.buffer,
        serialized.shapeData.meshVertProperties.buffer,
        serialized.shapeData.meshMergeFromVert.buffer,
        serialized.shapeData.meshMergeToVert.buffer,
        serialized.shapeData.geometryPositions.buffer,
        serialized.shapeData.geometryNormals.buffer,
        serialized.shapeData.geometryEdgePositions.buffer,
      );
    }
    return serialized;
  });

  console.log(
    `[serialize] ${result.objects.length} obj` +
    ` | getMesh=${timings.getMeshMs.toFixed(0)}ms` +
    ` copy=${timings.copyMs.toFixed(0)}ms` +
    ` bb=${timings.bbMs.toFixed(0)}ms` +
    ` geomArrays=${timings.geomArraysMs.toFixed(0)}ms` +
    ` sketch=${timings.sketchMs.toFixed(0)}ms`,
  );

  const serialized: SerializedRunResult = {
    objects,
    params: result.params,
    dimensions: result.dimensions,
    bom: result.bom,
    cutPlanes: result.cutPlanes,
    explodeView: result.explodeView,
    jointsView: result.jointsView,
    viewConfig: result.viewConfig,
    robotExport: result.robotExport,
    quality: result.quality,
    error: result.error,
    timeMs: result.timeMs,
    logs: result.logs,
    verifications: result.verifications,
    solverDebug,
  };

  return { serialized, transferables };
}

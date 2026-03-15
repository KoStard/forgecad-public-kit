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
import type {
  SerializedRunResult,
  SerializedSceneObject,
  SerializedShapeData,
  SerializedSketchData,
} from '../workers/evalWorkerProtocol';

function serializeShape(obj: SceneObject): SerializedShapeData | null {
  const { shape } = obj;
  if (!shape) return null;

  try {
    const rawMesh = shape.getMesh();

    // Copy TypedArrays out of WASM memory before they can be freed
    const meshTriVerts = new Uint32Array(rawMesh.triVerts);
    const meshVertProperties = new Float32Array(rawMesh.vertProperties);
    const meshMergeFromVert = new Uint32Array(rawMesh.mergeFromVert ?? new Uint32Array(0));
    const meshMergeToVert = new Uint32Array(rawMesh.mergeToVert ?? new Uint32Array(0));

    const bb = shape.boundingBox();
    const boundingBox = {
      min: [bb.min[0], bb.min[1], bb.min[2]] as [number, number, number],
      max: [bb.max[0], bb.max[1], bb.max[2]] as [number, number, number],
    };

    const faceNames = shape.faceNames();
    const faces: SerializedShapeData['faces'] = {};
    const faceHistories: SerializedShapeData['faceHistories'] = {};

    for (const name of faceNames) {
      try {
        const faceRef = shape.face(name);
        if (faceRef) {
          faces[name] = faceRef;
          faceHistories[name] = shape.faceHistory(name);
        }
      } catch {
        // Skip faces that can't be resolved
      }
    }

    const numTriangles = shape.numTri();
    const { positions: geometryPositions, normals: geometryNormals, edgePositions: geometryEdgePositions } =
      computeGeometryArrays({
        numProp: rawMesh.numProp,
        numTri: numTriangles,
        triVerts: meshTriVerts,
        vertProperties: meshVertProperties,
        mergeFromVert: meshMergeFromVert.length > 0 ? meshMergeFromVert : undefined,
        mergeToVert: meshMergeToVert.length > 0 ? meshMergeToVert : undefined,
      });

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

function serializeSceneObject(obj: SceneObject): SerializedSceneObject {
  return {
    id: obj.id,
    name: obj.name,
    shapeData: serializeShape(obj),
    sketchData: serializeSketch(obj),
    color: obj.color,
    geometryInfo: obj.geometryInfo,
    sketchMeta: (obj as any).sketchMeta,
    groupName: obj.groupName,
    treePath: obj.treePath,
  };
}

/**
 * Extract all transferable data from a RunResult.
 * Returns the serialized result AND a list of all TypedArray buffers
 * that should be transferred (zero-copy) via postMessage.
 */
export function serializeRunResult(result: RunResult): {
  serialized: SerializedRunResult;
  transferables: Transferable[];
} {
  const transferables: Transferable[] = [];

  const objects = result.objects.map((obj) => {
    const serialized = serializeSceneObject(obj);
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
  };

  return { serialized, transferables };
}

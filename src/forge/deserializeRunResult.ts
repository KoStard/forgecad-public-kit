/**
 * ForgeCAD — RunResult Deserializer
 *
 * Reconstructs a RunResult from the serialized wire format received from the
 * eval worker. Shape objects are FrozenShape instances (backed by a reconstructed
 * Manifold), sketch objects are FrozenSketch/FrozenConstraintSketch instances.
 * Runs on the main thread.
 */

import type { RunResult, SceneObject } from './runner';
import { FrozenShape } from './frozenShape';
import { FrozenSketch, FrozenConstraintSketch } from './frozenSketch';
import { setShapeCompilePlan } from './kernel';
import type { SerializedRunResult, SerializedSceneObject } from '../workers/evalWorkerProtocol';

function deserializeSceneObject(s: SerializedSceneObject): SceneObject {
  let shape = null;
  if (s.shapeData) {
    shape = new FrozenShape(s.shapeData);
    if (s.compilePlan) setShapeCompilePlan(shape, s.compilePlan);
  }

  let sketch = null;
  if (s.sketchData) {
    const d = s.sketchData;
    if (d.constraintMeta && d.constraintDefinition) {
      sketch = new FrozenConstraintSketch({
        ...d,
        constraintMeta: d.constraintMeta,
        constraintDefinition: d.constraintDefinition,
      });
    } else {
      sketch = new FrozenSketch(d);
    }
  }

  return {
    id: s.id,
    name: s.name,
    shape,
    sketch,
    color: s.color,
    geometryInfo: s.geometryInfo ?? null,
    sketchMeta: s.sketchMeta,
    groupName: s.groupName,
    treePath: s.treePath,
  } as SceneObject;
}

/** Reconstruct a RunResult from the worker's serialized wire format. */
export function deserializeRunResult(s: SerializedRunResult): RunResult {
  return {
    // Top-level shape/sketch are unused by the store/viewport
    shape: null,
    sketch: null,
    objects: s.objects.map(deserializeSceneObject),
    params: s.params,
    dimensions: s.dimensions,
    bom: s.bom,
    cutPlanes: s.cutPlanes,
    explodeView: s.explodeView,
    jointsView: s.jointsView,
    viewConfig: s.viewConfig,
    robotExport: s.robotExport,
    quality: s.quality,
    error: s.error,
    timeMs: s.timeMs,
    logs: s.logs,
    verifications: s.verifications ?? [],
    solverDebug: s.solverDebug ?? null,
  } as RunResult;
}

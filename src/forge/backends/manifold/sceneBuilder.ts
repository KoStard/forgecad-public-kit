import { setMaterial } from 'manifold-3d/lib/scene-builder.js';
import type { Shape } from '../../kernel';
import { getShapeRuntimeBackend } from '../../kernel';
import { getWasm } from './wasm';
import { isManifoldCapableBackend } from './shapeBackend';
import { isOCCTShapeBackend } from '../occt/shapeBackend';

export function buildSceneBuilderPayloadForShape(
  shape: Shape,
  material?: { baseColorFactor: [number, number, number] },
) {
  const backend = getShapeRuntimeBackend(shape);

  let manifold: any;
  if (isManifoldCapableBackend(backend)) {
    manifold = backend.requireManifold();
  } else if (isOCCTShapeBackend(backend)) {
    // For OCCT shapes, reconstruct a Manifold from the mesh data
    // so the scene builder can process it for 3MF export.
    const mesh = backend.getMesh();
    const wasm = getWasm();
    const wasmMesh = new wasm.Mesh({
      numProp: mesh.numProp,
      triVerts: mesh.triVerts,
      vertProperties: mesh.vertProperties,
      mergeFromVert: mesh.mergeFromVert,
      mergeToVert: mesh.mergeToVert,
    });
    manifold = new wasm.Manifold(wasmMesh);
  } else {
    throw new Error('buildSceneBuilderPayloadForShape(): unknown backend type');
  }

  return material ? setMaterial(manifold, material) : manifold;
}

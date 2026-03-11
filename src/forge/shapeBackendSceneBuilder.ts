import { setMaterial } from 'manifold-3d/lib/scene-builder.js';
import type { Shape } from './kernel';
import { getShapeRuntimeBackend } from './kernel';
import { requireManifoldShapeBackend } from './shapeBackend';

export function buildSceneBuilderPayloadForShape(
  shape: Shape,
  material?: { baseColorFactor: [number, number, number] },
) {
  const manifold = requireManifoldShapeBackend(
    getShapeRuntimeBackend(shape),
    'buildSceneBuilderPayloadForShape()',
  );
  return material ? setMaterial(manifold, material) : manifold;
}

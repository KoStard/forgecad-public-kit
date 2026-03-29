/**
 * Mesh simplification via meshoptimizer (WASM).
 *
 * Uses quadric error metrics to reduce triangle count while preserving shape.
 * Initialized once alongside Manifold WASM — all operations are synchronous after init.
 */

import type { MeshoptSimplifier as MeshoptSimplifierType } from 'meshoptimizer';

let _simplifier: typeof MeshoptSimplifierType | null = null;

/**
 * Initialize the meshoptimizer WASM module.
 * Must be called once during kernel init (before any lowering).
 */
export async function initMeshoptimizer(): Promise<void> {
  if (_simplifier) return;
  const mod = await import('meshoptimizer');
  _simplifier = mod.MeshoptSimplifier;
  await _simplifier.ready;
}

/**
 * Simplify a mesh using quadric error decimation.
 *
 * @param triVerts - Triangle indices (flat Uint32Array)
 * @param vertProperties - Vertex positions (flat Float32Array, stride 3)
 * @param targetRatio - Target triangle count as fraction of input (0.25 = keep 25%)
 * @param maxError - Maximum geometric error as fraction of mesh extents
 * @returns Simplified triangle indices
 */
export function simplifyMesh(
  triVerts: Uint32Array,
  vertProperties: Float32Array,
  targetRatio: number,
  maxError: number,
): Uint32Array {
  if (!_simplifier) {
    throw new Error('meshoptimizer not initialized — call initMeshoptimizer() first');
  }

  const targetIndexCount = Math.max(3, Math.floor(triVerts.length * targetRatio));

  const [simplified] = _simplifier.simplify(
    triVerts,
    vertProperties,
    3, // stride
    targetIndexCount,
    maxError,
  );

  return simplified;
}

/**
 * Check if meshoptimizer is initialized and available.
 */
export function isMeshoptimizerReady(): boolean {
  return _simplifier !== null;
}

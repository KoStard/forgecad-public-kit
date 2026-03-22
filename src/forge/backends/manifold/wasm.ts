/**
 * Manifold WASM singleton — owns the lifecycle of the manifold-3d module.
 *
 * All Manifold-specific code should import from here rather than from kernel.ts.
 */

import type { ManifoldToplevel } from 'manifold-3d';

export type { Manifold, ManifoldToplevel } from 'manifold-3d';

let _wasm: ManifoldToplevel | null = null;

/**
 * Initialize the Manifold WASM module.
 * Cached — subsequent calls return the existing instance instantly.
 */
export async function initManifoldWasm(): Promise<ManifoldToplevel> {
  if (_wasm) return _wasm;
  const Module = (await import('manifold-3d')).default;
  const wasm = await Module();
  wasm.setup();
  wasm.setMinCircularAngle(2);
  wasm.setMinCircularEdgeLength(0.5);
  _wasm = wasm;
  return _wasm;
}

/**
 * Get the initialized Manifold WASM module.
 * Throws if `initManifoldWasm()` (or `initKernel()`) has not been called.
 */
export function getManifoldWasm(): ManifoldToplevel {
  if (!_wasm) throw new Error('Manifold WASM not initialized — call initKernel() first');
  return _wasm;
}

// TODO: Remove this alias once all callers migrate to getManifoldWasm()
export { getManifoldWasm as getWasm };

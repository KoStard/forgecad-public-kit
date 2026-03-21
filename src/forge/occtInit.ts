/**
 * ForgeCAD — OpenCascade.js WASM Initialization
 *
 * Singleton initializer for the OCCT WASM module.
 * Init happens once, result is cached. Safe to call multiple times.
 */

// The OCCT WASM module type — we use `any` because opencascade.js doesn't
// ship granular TypeScript definitions for the full API surface.
// All OCCT API access is through this module object.
export type OCCTModule = any;

let _occt: OCCTModule | null = null;
let _initPromise: Promise<OCCTModule> | null = null;

export async function initOCCT(): Promise<OCCTModule> {
  if (_occt) return _occt;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Use the appropriate entry point for the environment.
    // opencascade.js/dist/node.js patches __dirname and require for Node;
    // opencascade.js (main) uses browser-oriented WASM loading.
    const isNode = typeof process !== 'undefined'
      && typeof process.versions !== 'undefined'
      && typeof process.versions.node === 'string';
    const initOpenCascade = isNode
      ? (await import('opencascade.js/dist/node.js')).default
      : (await import('opencascade.js')).default;
    const oc = await initOpenCascade();
    _occt = oc;
    return oc;
  })();

  return _initPromise;
}

export function getOCCT(): OCCTModule {
  if (!_occt) throw new Error('OCCT not initialized — call initOCCT() first');
  return _occt;
}

export function isOCCTInitialized(): boolean {
  return _occt !== null;
}

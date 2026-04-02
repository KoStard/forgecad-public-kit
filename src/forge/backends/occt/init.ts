/**
 * ForgeCAD — OpenCascade.js WASM Initialization
 *
 * Singleton initializer for the OCCT WASM module.
 * Init happens once, result is cached. Safe to call multiple times.
 *
 * In the browser, the compiled WebAssembly.Module is cached in IndexedDB
 * so subsequent page loads skip both download and compilation (~13MB WASM).
 */

// The OCCT WASM module type — we use `any` because opencascade.js doesn't
// ship granular TypeScript definitions for the full API surface.
// All OCCT API access is through this module object.
export type OCCTModule = any;

// ---------------------------------------------------------------------------
// IndexedDB cache for compiled WebAssembly.Module
// ---------------------------------------------------------------------------

const IDB_NAME = 'forgecad-wasm-cache';
const IDB_STORE = 'modules';
const IDB_KEY = 'occt';

/** Current cache version — bump when upgrading opencascade.js. */
const OCCT_CACHE_VERSION = '2.0.0-beta.b5ff984';

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<{ version: string; module: WebAssembly.Module } | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: { version: string; module: WebAssembly.Module }): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Build an Emscripten `instantiateWasm` callback that caches the compiled
 * WebAssembly.Module in IndexedDB. On cache hit, instantiation skips both
 * the network fetch and WASM compilation.
 *
 * `wasmUrl` is captured from opencascade.js's locateFile before Emscripten
 * calls instantiateWasm.
 */
function buildCachedInstantiateWasm(captured: {
  wasmUrl: string;
}): (imports: WebAssembly.Imports, successCallback: (instance: WebAssembly.Instance) => void) => Record<string, never> {
  return (imports, successCallback) => {
    (async () => {
      try {
        const db = await openCacheDB();
        const cached = await idbGet(db, IDB_KEY);

        if (cached && cached.version === OCCT_CACHE_VERSION) {
          // Cache hit — instantiate from the stored compiled module.
          const instance = await WebAssembly.instantiate(cached.module, imports);
          successCallback(instance);
          return;
        }

        // Cache miss — fetch, compile, store, instantiate.
        const response = await fetch(captured.wasmUrl);
        const { instance, module } = await WebAssembly.instantiateStreaming(response, imports);

        // Store compiled module for next time (fire-and-forget).
        idbPut(db, IDB_KEY, { version: OCCT_CACHE_VERSION, module }).catch(() => {});

        successCallback(instance);
      } catch (e) {
        console.warn('[occtInit] Cached WASM instantiation failed, falling back to default:', e);
        const response = await fetch(captured.wasmUrl);
        const { instance } = await WebAssembly.instantiateStreaming(response, imports);
        successCallback(instance);
      }
    })();
    // Return empty object to signal async instantiation to Emscripten.
    return {} as Record<string, never>;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _occt: OCCTModule | null = null;
let _initPromise: Promise<OCCTModule> | null = null;

export async function initOCCT(): Promise<OCCTModule> {
  if (_occt) return _occt;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const isNode = typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions.node === 'string';

    if (isNode) {
      // Node.js — no IDB caching, use the Node entry point directly.
      // Node-only path — use variable to prevent Vite/Rollup from statically
      // analyzing and bundling the Node entry point into browser worker bundles.
      const nodeEntry = 'opencascade.js' + '/dist/node.js';
      const initOpenCascade = (await import(/* @vite-ignore */ nodeEntry)).default;
      const oc = await initOpenCascade();
      _occt = oc;
      return oc;
    }

    // Browser — use cached instantiation via IndexedDB.
    // opencascade.js's wrapper spreads `module` AFTER its own `locateFile`,
    // so we provide our own locateFile that captures the WASM URL and also
    // returns it to Emscripten. We pass `mainWasm` to get the bundled URL.
    const ocModule = await import('opencascade.js');
    const initOpenCascade = ocModule.default;

    // The default WASM asset is served from CDN to avoid bundling a 48MB file
    // (exceeds Cloudflare Pages' 25MB limit). The version must match the
    // installed opencascade.js package version in package.json.
    const ocFullWasm = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/opencascade.full.wasm';

    const oc = await initOpenCascade({
      mainWasm: ocFullWasm,
      module: {
        instantiateWasm: buildCachedInstantiateWasm({ wasmUrl: ocFullWasm }),
      },
    });
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

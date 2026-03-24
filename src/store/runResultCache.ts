/**
 * Run result LRU cache — avoids re-evaluating a file you just switched away from.
 * Persisted to sessionStorage so it survives page refreshes within the same tab.
 */

import type { RunResult } from '@forge/index';
import { deserializeRunResult } from '../forge/deserializeRunResult';
import type { SerializedRunResult, SerializedShapeData } from '../workers/evalWorkerProtocol';

export const RUN_RESULT_CACHE_MAX = 8;
export const SESSION_STORAGE_KEY = 'forgecad-run-cache';
export const CACHE_VERSION = 1;
/** Don't persist if serialized cache exceeds this size (sessionStorage limit ~5 MB). */
export const MAX_PERSIST_BYTES = 4 * 1024 * 1024;

export interface CacheEntry {
  code: string;
  files: Record<string, string>;
  paramOverrides: Record<string, number>;
  quality: string;
  backend: string;
  result: RunResult;
  /** Kept around so we can persist to sessionStorage without re-serializing shapes. */
  serialized: SerializedRunResult;
}

/** JSON-safe representation of a CacheEntry (TypedArrays → plain number[]). */
export interface PersistedCacheEntry {
  code: string;
  files: Record<string, string>;
  paramOverrides: Record<string, number>;
  quality: string;
  backend: string;
  serialized: unknown; // SerializedRunResult with TypedArrays replaced by number[]
}

/** Module-level LRU map: filePath → entry. JS Map preserves insertion order. */
export const runResultCache = new Map<string, CacheEntry>();

// -- TypedArray ↔ plain array helpers for JSON serialization -----------------

function typedArrayToArray(ta: Uint32Array | Float32Array): number[] {
  return Array.from(ta);
}

function shapeDataToJson(sd: SerializedShapeData): Record<string, unknown> {
  return {
    ...sd,
    meshTriVerts: typedArrayToArray(sd.meshTriVerts),
    meshVertProperties: typedArrayToArray(sd.meshVertProperties),
    meshMergeFromVert: typedArrayToArray(sd.meshMergeFromVert),
    meshMergeToVert: typedArrayToArray(sd.meshMergeToVert),
    geometryPositions: typedArrayToArray(sd.geometryPositions),
    geometryNormals: typedArrayToArray(sd.geometryNormals),
    geometryEdgePositions: typedArrayToArray(sd.geometryEdgePositions),
  };
}

function jsonToShapeData(raw: Record<string, any>): SerializedShapeData {
  return {
    ...raw,
    meshTriVerts: new Uint32Array(raw.meshTriVerts),
    meshVertProperties: new Float32Array(raw.meshVertProperties),
    meshMergeFromVert: new Uint32Array(raw.meshMergeFromVert),
    meshMergeToVert: new Uint32Array(raw.meshMergeToVert),
    geometryPositions: new Float32Array(raw.geometryPositions),
    geometryNormals: new Float32Array(raw.geometryNormals),
    geometryEdgePositions: new Float32Array(raw.geometryEdgePositions),
  } as SerializedShapeData;
}

function serializedResultToJson(sr: SerializedRunResult): unknown {
  return {
    ...sr,
    objects: sr.objects.map((obj) => ({
      ...obj,
      shapeData: obj.shapeData ? shapeDataToJson(obj.shapeData) : null,
    })),
  };
}

function jsonToSerializedResult(raw: any): SerializedRunResult {
  return {
    ...raw,
    objects: (raw.objects as any[]).map((obj: any) => ({
      ...obj,
      shapeData: obj.shapeData ? jsonToShapeData(obj.shapeData) : null,
    })),
  } as SerializedRunResult;
}

// -- sessionStorage persistence ----------------------------------------------

export function persistCache(): void {
  try {
    const entries: Record<string, PersistedCacheEntry> = {};
    for (const [key, entry] of runResultCache) {
      entries[key] = {
        code: entry.code,
        files: entry.files,
        paramOverrides: entry.paramOverrides,
        quality: entry.quality,
        backend: entry.backend,
        serialized: serializedResultToJson(entry.serialized),
      };
    }
    const json = JSON.stringify({ v: CACHE_VERSION, entries });
    if (json.length > MAX_PERSIST_BYTES) {
      // Too large — clear any stale persisted data and bail
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, json);
  } catch {
    // sessionStorage may be unavailable (private browsing) or full — ignore
  }
}

export function rehydrateCache(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || !parsed.entries) return;
    for (const [key, pe] of Object.entries<any>(parsed.entries)) {
      const serialized = jsonToSerializedResult(pe.serialized);
      const result = deserializeRunResult(serialized);
      runResultCache.set(key, {
        code: pe.code,
        files: pe.files,
        paramOverrides: pe.paramOverrides,
        quality: pe.quality,
        backend: pe.backend,
        result,
        serialized,
      });
    }
  } catch {
    // Corrupt or incompatible data — start fresh
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

// Rehydrate on module load
rehydrateCache();

// -- Cache lookup / store ----------------------------------------------------

export function lookupCache(
  filePath: string,
  code: string,
  files: Record<string, string>,
  paramOverrides: Record<string, number>,
  quality: string,
  backend: string,
): RunResult | null {
  const key = `${filePath}::${backend}`;
  const entry = runResultCache.get(key);
  if (!entry) return null;
  if (
    entry.code !== code ||
    entry.quality !== quality ||
    JSON.stringify(entry.paramOverrides) !== JSON.stringify(paramOverrides) ||
    JSON.stringify(entry.files) !== JSON.stringify(files)
  )
    return null;
  return entry.result;
}

export function storeCache(
  filePath: string,
  code: string,
  files: Record<string, string>,
  paramOverrides: Record<string, number>,
  quality: string,
  backend: string,
  result: RunResult,
  serialized: SerializedRunResult,
): void {
  const key = `${filePath}::${backend}`;
  runResultCache.delete(key); // re-insert to mark as recently used
  runResultCache.set(key, { code, files, paramOverrides, quality, backend, result, serialized });
  if (runResultCache.size > RUN_RESULT_CACHE_MAX) {
    runResultCache.delete(runResultCache.keys().next().value!);
  }
  persistCache();
}

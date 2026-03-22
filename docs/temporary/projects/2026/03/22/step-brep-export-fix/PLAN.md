# STEP/BREP Export Broken with OCCT Backend

## Goal

Fix STEP and BREP export when the user selects the OCCT backend in the UI. Currently always fails with:

> STEP export: object "..." does not have an OCCT TopoDS_Shape. Only OCCT-backed shapes can be exported to STEP.

## Root Cause

The OCCT `TopoDS_Shape` is **created in the eval worker** but **never reaches the main thread**.

### The Data Flow Today

```
User clicks "OCCT" backend
  → setActiveBackend('occt')
  → execute()
  → evalWorkerClient.run({ activeBackend: 'occt' })

Worker (evalWorker.ts):
  → setActiveBackend('occt')        // sets kernel._activeBackend in worker scope
  → runScript(code, ...)            // produces RunResult with OCCTShapeBackend shapes
  → serializeRunResult()            // extracts mesh triangles as TypedArrays
  → postMessage(serialized)         // only mesh data crosses the boundary

Main thread (deserializeRunResult.ts):
  → new FrozenShape(shapeData)      // reconstructs from mesh → FrozenShapeBackend
  → FrozenShapeBackend uses Manifold (always)
  → store.result = deserialized RunResult

User clicks "Export STEP":
  → exportExactFromStore('step')
  → reads store.result.objects[i].shape  →  FrozenShape (Manifold-backed)
  → passes to buildStepBlob()
  → buildStepBlob checks obj.shape?.shape (looking for TopoDS_Shape)
  → FrozenShapeBackend has no .shape getter → undefined → ERROR
```

The fundamental issue: `SerializedShapeData` only carries mesh triangles. OCCT B-rep topology (faces, edges, surfaces) cannot be recovered from triangles, so `FrozenShapeBackend` always reconstructs via Manifold.

### Secondary Issue

Even `rerunActiveScriptForQuality()` (which runs `runScript` directly on the main thread) wouldn't help — it never calls `setActiveBackend()`, so the main-thread kernel defaults to `'manifold'`.

## Architecture Summary

| Component | Thread | Role |
|-----------|--------|------|
| `forgeStore.execute()` | Main | Sends code + backend to worker |
| `evalWorker.ts` | Worker | Runs script, holds live OCCT shapes in `lastRunResult` |
| `serializeRunResult()` | Worker | Extracts mesh data → `SerializedShapeData` |
| `deserializeRunResult()` | Main | Rebuilds `FrozenShape` (Manifold only) |
| `exportExactFromStore()` | Main | Grabs shapes from store, passes to `buildStepBlob()` |
| `buildStepBlob()` | Main | Needs `OCCTShapeBackend.shape` (TopoDS_Shape) |
| `buildBrepBlob()` | Main | Same requirement |

## Fix Options

### Option A: Run STEP/BREP export in the worker

**Idea**: Add a new message type to `evalWorkerProtocol` (e.g., `'export-step'`). The worker already has live OCCT shapes in `lastRunResult`. It runs `buildStepBlob()` in-worker, serializes the resulting Blob as an `ArrayBuffer`, and sends it back.

**Pros**:
- Cleanest separation — OCCT shapes never need to cross the thread boundary
- Worker already retains `lastRunResult` with live shapes (used for `face-info` today)
- No new WASM instances needed
- Export runs off the main thread (better UX for large models)
- BREP export follows the exact same pattern

**Cons**:
- Need to import `buildStepBlob`/`buildBrepBlob` in the worker bundle
- Need new message types in the protocol
- Must handle case where `lastRunResult` is stale or null

**Complexity**: Medium. ~4 files changed. No architectural risk.

### Option B: Serialize BREP data alongside mesh in the wire protocol

**Idea**: In `serializeRunResult()`, also serialize each OCCT shape's BREP representation (via `BRepTools::Write`) as a string or `Uint8Array` in `SerializedShapeData`. On the main thread, `FrozenShape` carries this data and can reconstruct an `OCCTShapeBackend` when needed.

**Pros**:
- Makes OCCT data available on the main thread for any future use (not just export)
- No worker protocol changes

**Cons**:
- **Significantly increases wire payload size** — BREP strings can be 10-100x larger than mesh data
- BREP serialization is CPU-intensive; slows down every evaluation even when user won't export
- Requires OCCT to be initialized on the main thread to reconstruct shapes
- Would require lazy OCCT init on main thread (currently only initialized in worker)
- Wasteful — 99% of evaluations don't end in STEP export

**Complexity**: High. Major performance regression risk. Architecturally expensive.

### Option C: Re-run the script on the main thread with OCCT backend at export time

**Idea**: When `exportExactFromStore()` is called, re-run the script synchronously on the main thread (like `rerunActiveScriptForQuality()` does) but with `setActiveBackend('occt')`.

**Pros**:
- Minimal protocol changes
- Uses existing `runScript()` infrastructure

**Cons**:
- **Runs the full script on the main thread** — blocks UI for the entire evaluation
- OCCT evaluation is slower than Manifold (this is why the worker exists)
- Requires OCCT WASM to be loaded on the main thread (it currently isn't)
- Duplicates work — the worker already ran it
- For complex models, this could freeze the UI for 10+ seconds

**Complexity**: Medium, but poor UX.

### Option D: Dedicated export worker

**Idea**: Spawn a second worker specifically for STEP/BREP export that re-runs the script with OCCT backend.

**Pros**:
- Off main thread
- Isolated from eval worker lifecycle

**Cons**:
- Doubles WASM memory usage (two OCCT instances)
- Duplicates work (re-runs script)
- More infrastructure to maintain
- Overkill when the eval worker already has the shapes

**Complexity**: High. No clear benefit over Option A.

## Recommendation: Option A (export in worker)

Option A is the clear winner:
1. **Zero wasted work** — the OCCT shapes already exist in the worker's `lastRunResult`
2. **Off main thread** — good UX, no UI freezing
3. **Small surface area** — new message type in protocol, export logic in worker, thin async wrapper in `exportActions.ts`
4. **Follows existing pattern** — `face-info` already demonstrates on-demand worker queries against `lastRunResult`

### Implementation sketch for Option A

1. **`evalWorkerProtocol.ts`** — Add types:
   ```ts
   interface EvalWorkerExportExactRequest {
     type: 'export-exact';
     payload: { reqId: number; format: 'step' | 'brep'; objectIds?: string[] };
   }
   interface EvalWorkerExportExactSuccess {
     type: 'export-exact-success';
     payload: { reqId: number; data: ArrayBuffer; format: 'step' | 'brep' };
   }
   interface EvalWorkerExportExactError {
     type: 'export-exact-error';
     payload: { reqId: number; message: string };
   }
   ```

2. **`evalWorker.ts`** — Handle `'export-exact'`:
   - Read shapes from `lastRunResult`
   - Call `buildStepBlob()` or `buildBrepBlob()`
   - Convert Blob → ArrayBuffer, postMessage with transfer

3. **`evalWorkerClient.ts`** — Add `exportExact(format, objectIds?)` method returning `Promise<Blob>`

4. **`exportActions.ts`** — Change `exportExactFromStore()` to call `evalWorkerClient.exportExact()` instead of building shapes from store

### Edge cases to handle
- **Stale `lastRunResult`**: If the user edits code but doesn't re-run before exporting. Could compare a hash/seq or just return an error.
- **Backend mismatch**: If `lastRunResult` was run with Manifold backend, shapes won't have OCCT backing. Should check and return a clear error ("Re-run with OCCT backend first").
- **Worker busy**: If an evaluation is in-flight when export is requested. Queue it or reject.

## Files Modified

| File | Purpose |
|------|---------|
| `src/workers/evalWorkerProtocol.ts` | New message types |
| `src/workers/evalWorker.ts` | Handle export-exact request |
| `src/workers/evalWorkerClient.ts` | New `exportExact()` method |
| `src/components/exportActions.ts` | Use worker for exact export |
| `src/forge/exportStep.ts` | Minor: relax type / add `isOCCTShape` guard |
| `src/forge/exportBrepNative.ts` | Same as exportStep |

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline: STEP/BREP export always fails with OCCT backend | Bug confirmed |
| P1 | (pending) Implement Option A | Not started |

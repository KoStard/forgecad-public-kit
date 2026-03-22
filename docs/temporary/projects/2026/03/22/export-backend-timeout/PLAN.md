# Export Backend Selection & Timeout Improvements

## Goal

Two problems to solve:

1. **Export backend independence** — Users should be able to view in Manifold (fast) but export STEP/BREP through OCCT (exact). Currently, STEP/BREP export doesn't exist in the UI at all. The export panel only offers mesh formats (3MF/STL), GIF, Report, and 2D sketch exports.

2. **Timeout frustration** — The 30-second `RUN_TIMEOUT_MS` kills the worker for any script evaluation that takes >30s. This is especially bad for exports, which may need to re-run the script with OCCT backend + write STEP/BREP files. Export should have a much more generous (or no) timeout.

## Current State (Baseline)

### Export Panel (`ExportPanel.tsx`)
- Mesh formats: 3MF (recommended), STL (legacy)
- Quality selector: Default / Live / High
- Animation GIF export
- Report PDF export
- 2D Sketch export (SVG, DXF, PDF)
- **No STEP/BREP export at all**

### Backend Selection (`ViewPanel.tsx`)
- Two buttons in view panel: "Manifold (fast)" / "OCCT (exact)"
- Changing backend triggers full re-execution via `execute()`
- Backend stored in `viewPreferences` (localStorage)
- Cache keys include backend: `${filePath}::${backend}`

### Timeout (`evalWorkerClient.ts`)
- `INIT_TIMEOUT_MS = 120_000` (120s for WASM loading)
- `RUN_TIMEOUT_MS = 30_000` (30s for script evaluation)
- On timeout: worker is terminated, all pending requests rejected
- **No separate timeout for export operations**
- **No progress-based timeout reset**

### Worker Protocol (`evalWorkerProtocol.ts`)
- `run` message: main → worker (script evaluation)
- `face-info` message: main → worker (on-demand face queries)
- **No `export-exact` message type exists**

### BREP Export Infrastructure (exists but not wired to UI)
- `brepExport.ts`: `buildBrepExportManifest()` produces export plans
- `compiledScene.ts`: Routes shapes to exact (CadQuery OCCT) or faceted fallback
- `cadqueryPlan.ts`: Represents CadQuery operations for OCCT lowering
- **The lowering pipeline exists but there's no UI to trigger it**

## Architecture Summary

```
User clicks Export → ExportPanel.tsx
  → exportActions.ts (orchestration)
    → Mesh: builds blob on main thread from serialized mesh data
    → Exact (STEP/BREP): needs worker round-trip because OCCT shapes live in worker WASM

Worker (evalWorker.ts):
  → Holds live WASM kernel (Manifold + OCCT)
  → lastRunResult retains live Shape objects
  → Can re-run script with different backend if needed

Timeout (evalWorkerClient.ts):
  → Single timer, shared between run and export
  → killWorker() terminates everything on timeout
```

## Plan

### P1: Add export-exact worker protocol + client method

Add `export-exact` request/response to protocol. Worker handler:
1. Check if `lastRunResult` has OCCT shapes
2. If not, re-run script with `setActiveBackend('occt')`
3. Build STEP or BREP blob using existing `buildStepBlob()`/`buildBrepBlob()` from `backends/occt/lower.ts`
4. Return ArrayBuffer via transferable

Client method: `evalWorkerClient.exportExact(format, scriptContext)` → Promise<Blob>

**Key**: Export timeout should be separate and much longer than run timeout.

### P2: Add STEP/BREP section to ExportPanel

Add "Exact Geometry" section below mesh format section with STEP and BREP buttons.
- Always enabled (export will force OCCT re-run if needed)
- Show note: "Requires OCCT — will re-evaluate if currently viewing with Manifold"
- Busy state with spinner during export

### P3: Separate export timeout from run timeout

- `RUN_TIMEOUT_MS = 30_000` (unchanged for interactive evaluation)
- `EXPORT_TIMEOUT_MS = 300_000` (5 minutes for export — OCCT re-run + STEP/BREP writing)
- Worker sends progress phases for export: `'export-evaluating'` → `'export-writing'`
- Each progress phase resets the export timeout (progress-based keep-alive)

### P4: Progress-based timeout for regular runs

- When worker sends `progress` updates, reset the timeout
- This means a long-running script that's making progress won't be killed
- Add `'solving'` phase for constraint solver (which can be slow)
- Keep the 30s as a "no progress" timeout rather than absolute timeout

## Progress Tracker

| # | Change | Metric | Status |
|---|--------|--------|--------|
| — | Baseline | No STEP/BREP in UI, 30s hard timeout | Measured |
| P1 | export-exact protocol | STEP/BREP export works via worker | DONE |
| P2 | ExportPanel STEP/BREP buttons | UI complete | DONE |
| P3 | Separate export timeout | Export gets 5min timeout, resets on progress | DONE |
| P4 | Progress-based timeout reset | Deferred — P3 covers export case | Deferred |

## Experiment Log

#### P1: Export-Exact Worker Protocol (DONE)
**What**: Added `export-exact` request/response to worker protocol. Worker handler checks if lastRunResult has OCCT shapes; if not, re-runs script with `setActiveBackend('occt')`. Uses `STEPControl_Writer` and `BRepTools.Write_3` directly from opencascade.js WASM to write STEP/BREP via Emscripten virtual FS.
**Result**: Clean type-check, CLI builds successfully.
**Key design decision**: Export writes STEP/BREP directly from OCCT WASM shapes in the worker, bypassing the Python/CadQuery pipeline used by CLI. This means in-browser export is self-contained — no Python dependency needed.

#### P2: ExportPanel UI (DONE)
**What**: Added "Exact Geometry (OCCT)" section to ExportPanel with STEP and BREP buttons. Buttons show spinner during export. Always enabled — export will auto re-evaluate with OCCT if currently viewing with Manifold.
**Result**: UI complete with busy states and error handling matching existing export patterns.

#### P3: Separate Export Timeout (DONE)
**What**: Added `EXPORT_TIMEOUT_MS = 300_000` (5 minutes). Export timeout resets on each progress phase change (export-evaluating → export-writing). Export timeout only rejects export promises — does NOT kill the worker (unlike run timeout).
**Result**: Export phases don't affect the UI evaluation status indicator (filtered in forgeStore callback).

## Files Modified

| File | Purpose |
|------|---------|
| `src/workers/evalWorkerProtocol.ts` | Added ExactExportFormat, export-exact request/response types, export phases |
| `src/workers/evalWorker.ts` | Added handleExportExact: OCCT re-run, writeStepBlob, writeBrepBlob |
| `src/workers/evalWorkerClient.ts` | Added exportExact() method, EXPORT_TIMEOUT_MS, separate timeout tracking |
| `src/components/ExportPanel.tsx` | Added STEP/BREP export section with spinner and busy state |
| `src/components/exportActions.ts` | Added exportExactFromStore() orchestration |
| `src/store/forgeStore.ts` | Filter export phases from evaluationPhase state |

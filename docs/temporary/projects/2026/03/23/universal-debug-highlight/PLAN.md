# Universal Debug Highlight API

## Goal & Current State

**Goal**: Enable one-line debug visualization of any geometry primitive — points, edges, planes, surfaces, and 3D shapes — via `highlight(obj)`.

**Baseline**: `highlight()` only accepted 2D sketch entity IDs (strings like `'L0'`, `'P0'`, `'C0'`). No support for 3D geometry.

**Result**: Universal `highlight()` now accepts 8 input types with full backward compatibility.

## Architecture Summary

### Pipeline
1. Script calls `highlight(target, opts?)` → type-detects input and normalizes:
   - **String** → legacy `HighlightDef` for sketch entities
   - **[x,y,z]** → `DebugHighlightPoint`
   - **[[start],[end]]** → `DebugHighlightEdge`
   - **EdgeRef** (from `shape.edge()`) → `DebugHighlightEdge`
   - **FaceRef** (from `shape.face()`) → `DebugHighlightPlane` (computed from center/normal)
   - **{normal, offset}** or **{normal, point}** → `DebugHighlightPlane`
   - **Shape/TrackedShape** → `DebugHighlightShape` (resolved to object index)
2. Collected in separate arrays: `collectedHighlights[]` (2D) and `collectedDebugHighlights3D[]` (3D)
3. `debugHighlights3D` flows through `RunResult` → serialization → Viewport as plain data
4. `DebugHighlightsOverlay` renders 3D highlights; `ForgeObject` renders shape highlights as overlays

### Key Design Decisions
- **Separate from sketch highlights**: 2D sketch system untouched. 3D is a new overlay layer.
- **Duck-type detection**: Avoids circular imports by checking for `.getMesh()` method.
- **No WASM dependency**: All 3D highlights are plain data — zero serialization cost.
- **Shape resolution deferred**: Shape→index mapping happens after objects are built.

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline: highlight only works for sketch entity IDs | Measured |
| P1 | Extend highlights.ts with DebugHighlight3D types and universal highlight() | Done |
| P2 | Wire debugHighlights3D through RunResult and serialization | Done |
| P3 | Render 3D debug highlights in Viewport | Done |
| P4 | Export in public API with TypeScript types | Done |
| P5 | Build & verify | Done |

## Experiment Log

#### P1: Universal highlight() API (SUCCESS)
**What**: Rewrote `highlights.ts` with type guards for Vec3, edge pairs, PlaneSpec, FaceRef, EdgeRef, and Shape-like objects. Each input type normalizes to a typed `DebugHighlight3D` discriminated union.
**Result**: All 8 input types detected correctly. Validation catches NaN, Infinity, empty strings. Error messages list accepted types.
**Lesson**: Duck-typing (`isShapeLike`) via method check avoids circular import between highlights.ts and kernel.ts.

#### P2: Serialization pipeline (SUCCESS)
**What**: Added `debugHighlights3D: DebugHighlight3D[]` to `RunResult`. Flows through serialization via spread passthrough (zero changes to serializeRunResult.ts). Deserialization adds `?? []` fallback.
**Result**: Zero-cost change — no TypedArrays or WASM involved.
**Lesson**: The spread-based serialize/deserialize pattern made adding new plain-data fields trivial.

#### P3: Viewport rendering (SUCCESS)
**What**: Created `DebugHighlightPointItem`, `DebugHighlightEdgeItem`, `DebugHighlightPlaneItem` as individual React components (avoiding hooks-in-map violation). `DebugHighlightsOverlay` orchestrates them with pulse animation. `ForgeObject` gained `debugHighlightColor` prop for shape overlays.
**Result**: Points render as spheres, edges as line segments with endpoint spheres, planes as semi-transparent discs with normal arrows and border rings, shapes as transparent colored overlays. All support optional labels via Html overlay.

#### P4: Public API types (SUCCESS)
**What**: Added 8 overload declarations for `highlight()` in `forge-public-api.ts` with full JSDoc. Exported `HighlightOptions` type.
**Result**: Monaco intellisense shows all accepted input types with documentation.

#### P5: Build & verify (SUCCESS)
**What**: TypeScript compilation: 0 errors. CLI build: clean. Check suite: all passing (1 pre-existing SVG snapshot mismatch). Runtime test with all 8 highlight types: all succeed.
**Result**: Full implementation verified end-to-end.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/highlights.ts` | New types (DebugHighlight3D union) and universal highlight() with type detection |
| `src/forge/runner.ts` | Wire debugHighlights3D into RunResult, resolve shape highlights to indices |
| `src/forge/deserializeRunResult.ts` | Deserialize debugHighlights3D with fallback |
| `src/store/forgeStore.ts` | Initialize debugHighlights3D in empty result |
| `src/components/Viewport.tsx` | DebugHighlightsOverlay component, ForgeObject debugHighlightColor prop |
| `src/forge/forge-public-api.ts` | highlight() overload declarations for Monaco intellisense |
| `examples/api/highlight-debug.forge.js` | Example demonstrating all highlight types |

# OCCT Performance & Reliability

## Goal & Current State

Identify and fix OCCT backend performance bottlenecks and correctness bugs. Started with "too slow" reports on page refresh. Expanded to systematic bug fixing across all example files.

**Final result: 161/161 geometry files pass** (was ~116/180 before fixes). Remaining 19 non-passes are import/file-not-found (14), helper files (2), and project() unsupported (3).

## Architecture Summary

ForgeCAD has two geometry backends: Manifold (mesh-based, fast) and OCCT (B-rep, exact). Scripts compile to an IR (`ShapeCompilePlan`) which is lowered to either backend. OCCT runs as WASM (~13MB) in a web worker. Initialization involves: WASM download → compilation → module instantiation.

## Baseline Measurements (Node.js, CLI)

### Kernel Init
| Component | Time |
|-----------|------|
| Manifold import + init | 26ms |
| **OCCT WASM init** | **2109ms** |
| Solver WASM | 18ms |

### Per-Model (with OCCT backend)
| Model | runScript | Objects | Bottleneck |
|-------|-----------|---------|------------|
| ams_lite_adapter | 2075ms | 1 | 8 OCCT ops × 195ms avg |
| wire-decoiler | 32587ms | 0* | 114 OCCT booleans × 285ms avg |
| helical-gear-shaft | 38ms | 1 | Fast — single revolve |
| gridfinity-box | 44ms | 0* | scaleTop → fallback, returns 0 objs |

*0 objects = error during OCCT processing

### Per-Model (with Manifold backend)
| Model | runScript | Objects |
|-------|-----------|---------|
| wire-decoiler | 177ms | 22 |

## Progress Tracker

| # | Change | Key Metric | Status |
|---|--------|-----------|--------|
| — | Baseline | 116/180 pass, wire-decoiler 32587ms | Measured |
| P1 | IDB compiled WASM cache | Browser init TBD | ✅ Implemented |
| P2 | Fix default backend to occt | — | ✅ Done |
| P3 | Batched booleans (SetArguments/SetTools) | wire-decoiler 32587→3326ms | ✅ **~10× faster** |
| P4 | Fix BRepOffsetAPI_MakeOffset overload | offset profiles work | ✅ Fixed |
| P5 | Direct roundedRect construction (arcs+lines) | ~35 files fixed | ✅ Fixed |
| P6 | Fix gp_Pln_3 + BRepBuilderAPI_MakeFace_9 | trimmed-access-cover works | ✅ Fixed |
| P7 | Skip degenerate edges in buildWireFromPoints | bottle.forge.js works | ✅ Fixed |
| P8 | shapeToFace() for compound results | offset/boolean profiles work | ✅ Fixed |
| P9 | OCCTUnsupportedError for hull/project | Manifold fallback works | ✅ Fixed |
| P10 | Cache OCCT shapes on compile plan nodes | robot_hand 104→18s, chess-set 24→6s | ✅ **2-6× faster** |
| — | **Final** | **161/161 pass, robot_hand 104→18s** | ✅ |
| — | **Final** | **161/161 geometry files pass** | ✅ |

## Experiment Log

#### Baseline Measurement (COMPLETE)
**What**: Profiled OCCT init and per-model execution time using Node.js/tsx.
**Result**: OCCT init = 2.1s, wire-decoiler = 32.5s (114 boolean ops × 285ms).
**Why**: OCCT B-rep booleans are fundamentally expensive — each `BRepAlgoAPI_Cut` is ~100-300ms.
**Lesson**: OCCT boolean count is the primary perf variable, not WASM init.

#### Batched Booleans (SUCCESS — 10× speedup)
**What**: Replaced sequential pairwise `BRepAlgoAPI_Cut_3(result, tool_i)` loop with single `BRepAlgoAPI_Cut_1()` using `SetArguments(base)` + `SetTools(all_tools)` + `Build()`.
**Result**: wire-decoiler 32587ms → 3326ms (9.8× faster).
**Lesson**: Always batch OCCT boolean operations when possible.

#### IDB WASM Cache (IMPLEMENTED — browser measurement pending)
**What**: Cache compiled `WebAssembly.Module` in IndexedDB to skip re-download and re-compilation on page refresh.
**Result**: Not yet measured in browser. Expected to reduce init from ~2-5s to <1s on repeat loads.

#### Wrong OCCT Overloads (SUCCESS — 3 bugs fixed)
**What**: opencascade.js uses numbered suffixes for C++ overloads. Several were wrong:
- `BRepOffsetAPI_MakeOffset_3` (takes wire) → `_2` (takes face)
- `gp_Pln_2` (takes gp_Ax3) → `_3` (takes point + direction)
- `BRepBuilderAPI_MakeFace_4` (wrong param count) → `_9` (takes plane + 4 bounds)
- Also needed `.Face()` instead of `.Shape()` for `MakeHalfSpace_1`
**Result**: trimmed-access-cover.forge.js and all half-space cut operations now work.
**Lesson**: Always verify OCCT overload numbers with a probe script. The numbering is arbitrary and differs across opencascade.js versions.

#### roundedRect Direct Construction (SUCCESS — ~35 files fixed)
**What**: Replaced offset-based roundedRect profile (BRepOffsetAPI_MakeOffset on a rect) with direct construction using 4 line edges + 4 arc edges (BRepBuilderAPI_MakeEdge_9 with gp_Circ).
**Result**: All roundedRect-based models now produce correct geometry. This was the #1 failure category (~35 files).
**Lesson**: The offset API returns compounds, not faces/wires. Building geometry directly with edges avoids this type conversion complexity.

#### Degenerate Edge Filtering (SUCCESS — bottle.forge.js fixed)
**What**: User polygon profiles with shoulder curves often have duplicate consecutive vertices (e.g., `[bodyR, bodyH-shoulderR]` appears twice when the straight segment meets the curve). OCCT revolve crashes on zero-length edges from these duplicates.
**Result**: Added degenerate edge skip in `buildWireFromPoints()`. bottle.forge.js (2 objects: bottle + cap) now works.
**Lesson**: Always filter zero-length edges when building wires from user-provided point arrays.

#### shapeToFace Helper (SUCCESS — offset/boolean profiles fixed)
**What**: OCCT boolean and offset operations on 2D profiles return compounds, not faces. Added `shapeToFace()` to extract wires from compounds and rebuild faces.
**Result**: ngon.offset.extrude, path.offset.extrude, and 2D boolean profiles now work.

#### Compile Plan Shape Caching (SUCCESS — 2-6× speedup)
**What**: Every Shape operation (translate, subtract, fillet, etc.) called `buildShapeFromCompilePlan` which re-lowered the ENTIRE compile plan tree from scratch via `lowerShapeCompilePlanToOCCT`. For a model with N chained operations, this caused O(N²) redundant OCCT constructor/boolean calls. Profiling showed:
- robot_hand_2 (47 objects): 3383 lower calls, max depth 15
- chess-set (37 objects): 9050 lower calls, 18.8× redundancy
- bottle (2 objects): 302 lower calls, 18.9× redundancy

**Root cause**: ForgeCAD's immutable compile plan architecture means every `.translate()`, `.subtract()`, etc. creates a new plan wrapping the old one. `lowerShapeCompilePlanToOCCT` recursively rebuilds the entire history each time. Fusion 360 doesn't have this problem because it operates on persistent mutable B-rep shapes.

**Fix**: Cache the lowered `TopoDS_Shape` on each plan node via a hidden `_occtCache` property. The cache is preserved through `cloneShapeCompilePlan()`. When `lowerShapeCompilePlanToOCCT` encounters a cached node, it returns immediately.

**Result**:
| Model | Before | After | Speedup |
|-------|--------|-------|---------|
| robot_hand | 104.0s | 17.8s | 5.8× |
| robot_hand_2 | 8.5s | 1.9s | 4.5× |
| chess-set | 23.9s | 6.0s | 4.0× |
| laptop | 3.3s | 1.5s | 2.3× |
| bottle | 1.8s | 1.1s | 1.6× |

**Lesson**: The compile plan architecture is elegant for backend switching and topology tracking, but without memoization it causes quadratic OCCT work. Caching makes the plan a "lazy evaluation" tree — each node is computed at most once.

**Remaining opportunity**: chess-set still shows 7× redundancy despite caching. This is because `queryOwner` wrapper nodes create new plan objects on each access, so the cache doesn't always hit. A deeper fix would use stable plan node IDs or structural hashing.

## Remaining Issues

1. **project() not yet implemented for OCCT** (3 files): Falls back to Manifold via OCCTUnsupportedError. Low priority — these models work with Manifold fallback.

2. **Sequential test runner cascading failures**: When one file causes a C++ WASM exception, the module state is corrupted and all subsequent files fail. All files pass when run individually. A process-per-test runner would fix this but is not needed for correctness.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/compilePlanOCCT.ts` | roundedRect rewrite, offset fix, shapeToFace, degenerate edge filter, gp_Pln_3, MakeFace_9, hull/project OCCTUnsupportedError |
| `src/forge/occtShapeBackend.ts` | gp_Pln_3, MakeFace_9 overload fixes |
| `src/forge/occtInit.ts` | IDB WASM cache for compiled module |
| `src/forge/kernel.ts` | Default backend fix |
| `scripts/occt-test-all.mts` | Batch test runner |

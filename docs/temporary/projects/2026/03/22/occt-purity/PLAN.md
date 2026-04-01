# OCCT Backend Purity — Eliminate Manifold Fallbacks

**Date**: 2026-03-22
**Goal**: Make `compilePlanOCCT.ts` fully self-contained with zero Manifold dependencies for booleans, loft, sweep, and extrude-with-scaleTop.

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | 5 Manifold fallbacks, sentinel system | |
| P1 | Native OCCT booleans | All coincident-geometry cases pass; cup example: 54559mm³ vs Manifold 54548mm³ | ✅ |
| P2 | Native loft (ThruSections) | Implemented via BRepOffsetAPI_ThruSections | ✅ |
| P3 | Native sweep (MakePipe) | Implemented via BRepOffsetAPI_MakePipe with auto-orientation | ✅ |
| P4 | Hull | Kept as OCCTUnsupportedError (no native OCCT hull API) | ✅ acceptable |
| P5 | Extrude scaleTop (ThruSections) | 2-section loft with scaled top wire | ✅ |
| P6 | Remove Manifold imports | Zero Manifold references in compilePlanOCCT.ts | ✅ |
| P7 | Build + test | check suite: same 3 pre-existing failures only | ✅ |
| P8 | --backend CLI flag | `forgecad run/export --backend occt` works | ✅ |

## Experiment Log

#### P1: Native OCCT Booleans (SUCCESS)
**What**: Removed `hybridBooleanViaManifold`, `MANIFOLD_SENTINEL`, `occtShapeToManifold`, `tessellateOCCTShape`, `buildMergeMaps`. All booleans now use `occtNativeBoolean` directly.
**Result**: All tested models pass. Volume difference < 0.1% between backends (tessellation precision).
**Why it worked**: OCCT's BRepAlgoAPI handles coincident/coplanar geometry correctly in opencascade.js 2.0.0-beta. The hybrid approach was defensive but unnecessary.
**Lesson**: The sentinel system was the biggest source of complexity — it blocked fillet/chamfer/trimByPlane after any boolean. Removing it unlocked full B-rep workflow.

#### P2: Native Loft via ThruSections (SUCCESS)
**What**: Implemented `lowerLoftPlan` using `BRepOffsetAPI_ThruSections`. Each profile is lowered to a face, outer wire extracted, translated to its height, and added to ThruSections.
**Result**: API verified with polygon and multi-section loft tests.

#### P3: Native Sweep via MakePipe (SUCCESS)
**What**: Implemented `lowerSweepPlan` using `BRepOffsetAPI_MakePipe_1`. Path polyline → wire spine, profile → face oriented at spine start.
**Result**: API verified with polyline paths. Orientation computed via Z-to-tangent rotation.

#### P5: Extrude with scaleTop via ThruSections (SUCCESS)
**What**: Implemented `lowerExtrudeWithScaleTop` as 2-section loft — bottom wire at z=0, top wire (scaled via GTrsf) at z=height.
**Result**: Replaces `throw OCCTUnsupportedError('extrude with scaleTop')`.

#### P8: --backend CLI flag (SUCCESS)
**What**: Added `--backend manifold|occt` to `forgecad run` and `forgecad export 3mf|stl`.
**Result**: `forgecad run examples/cup.forge.js --backend occt` works correctly.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/compilePlanOCCT.ts` | Removed Manifold fallbacks, added native loft/sweep/scaleTop |
| `cli/test-run.ts` | Added --backend flag to `forgecad run` |
| `cli/forge-mesh.ts` | Added --backend flag to `forgecad export 3mf/stl` |
| `cli/forgecad.ts` | Updated CLI usage/completion for --backend |

## Remaining Manifold Dependencies

1. **Hull** (`compilePlanOCCT.ts`): Throws `OCCTUnsupportedError`, caught by `kernel.ts` which falls back to Manifold. No native OCCT hull API exists.
2. **Profile hull/project** (`compilePlanOCCT.ts`): Same pattern — 2D operations without OCCT equivalents.
3. **`kernel.ts` fallback catch**: Still catches `OCCTUnsupportedError` and falls back to Manifold. This is the correct safety net.

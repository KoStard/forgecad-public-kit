# OCCT Sketch Parity Investigation

## Goal & Current State

**Goal**: Fix geometry artifacts when ForgeCAD models using 2D sketch operations (difference2d, union2d, roundedRect, circle2d, slot) are rendered with the OCCT backend.

**Baseline failures**:
- `lock.forge.js`: Swing Arm volume 10.1% off (manifold=3173.61 vs occt=2852.93)
- `07-mini-cassette.forge.js`: volume 5.7% off (manifold=20952.96 vs occt=22222.30)

**Result**: Both files now pass at 100% parity after the fix.

## Architecture Summary

ForgeCAD uses a backend-agnostic `ProfileCompilePlan` IR that gets lowered to either:
- **Manifold**: `CrossSection` (mesh-based 2D CSG) — reference/correct behavior
- **OCCT**: `TopoDS_Face` (exact B-Rep) via `lowerProfileToFace()` in `backends/occt/lower.ts`

## Progress Tracker

| # | Change | Vol Diff (cassette) | Vol Diff (lock) | Status |
|---|--------|-------------------|-----------------|--------|
| -- | Baseline | 5.7% | 10.1% | measured |
| E1 | List-based fuse + UnifySameDomain | 0% | 29.1% (worse) | partial |
| E2 | + List-based cut for difference | 0% | 0% but surface area wrong | partial |
| E3 | Skip shapeToFace — return compound | 0% | 0% | **FIXED** |

## Experiment Log

#### E1: Replace pairwise BRepAlgoAPI_Fuse with list-based API (PARTIAL SUCCESS)
**What**: Changed union operations from pairwise `BRepAlgoAPI_Fuse_3(a, b)` chaining to list-based `BRepAlgoAPI_Fuse_1()` with `SetArguments/SetTools`. Added `ShapeUpgrade_UnifySameDomain` to merge face fragments.
**Result**: Cassette fixed (100%), but lock arm got worse (29.1% diff). Union was correct but subsequent `profileDifference` (wire insertion) failed on the unified face.
**Why it partially failed**: Wire insertion assumes the cutter is fully contained. For partially overlapping cutters, it produces wrong geometry. Also, `shapeToFace` was corrupting the unified face by merging wires from disconnected regions.
**Lesson**: OCCT's wire insertion approach for coplanar face subtraction is fragile — works only for fully contained cutters.

#### E2: Replace wire insertion with list-based BRepAlgoAPI_Cut (PARTIAL SUCCESS)
**What**: Replaced `profileDifference()` (wire insertion) with `BRepAlgoAPI_Cut_1()` list-based API for all boolean operations (union, difference, intersection).
**Result**: Volumes now correct, but surface areas wrong (~17% too high). The extruded compound of face fragments had internal partition walls.
**Why it partially failed**: Extruding a compound of face fragments creates internal walls at partition edges. These contribute to surface area but not volume.
**Lesson**: Compounds must be unified before extrusion to avoid parasitic internal surfaces.

#### E3: Unify after boolean, skip shapeToFace (SUCCESS)
**What**: After list-based boolean + `ShapeUpgrade_UnifySameDomain`, return the shape directly instead of forcing it through `shapeToFace`. When `UnifySameDomain` produces disconnected regions (multiple faces), returning the compound preserves correct topology. `shapeToFace` was merging wires from disconnected faces into a broken single-face topology.
**Result**: All 14 test cases pass at 100% parity. Both original failing examples (lock.forge.js, cassette) pass at 100%.
**Lesson**: In OCCT, disconnected planar regions must stay as separate faces in a compound. Forcing them into a single face via wire merging creates invalid topology that breaks downstream boolean operations.

## Root Cause Summary

Two bugs in `src/forge/backends/occt/lower.ts`:

1. **Pairwise boolean chaining**: The old code did `fuse(a, b)` → `shapeToFace` → `fuse(result, c)` → `shapeToFace` → ... Each `shapeToFace` call created a face with internal partition edges from the previous boolean. These partition edges corrupted subsequent operations. **Fix**: Use the list-based `BRepAlgoAPI_Fuse/Cut/Common` API to do all operations at once.

2. **shapeToFace corrupting disconnected regions**: When a boolean result has disconnected regions (e.g., a rect unioned with a distant circle), `ShapeUpgrade_UnifySameDomain` correctly keeps them as separate faces in a compound. But `shapeToFace` would merge all wires from all faces into a single `BRepBuilderAPI_MakeFace`, creating invalid topology. **Fix**: Return the compound directly, only unify on demand for operations that truly need a single face (offset, loft, sweep, profileBackend).

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/backends/occt/lower.ts` | Fix boolean lowering: list-based API, remove shapeToFace from boolean handler |
| `docs/temporary/projects/2026/03/25/occt-sketch-parity/PLAN.md` | This document |
| `docs/temporary/projects/2026/03/25/occt-sketch-parity/tests/*.forge.js` | Test cases |

# OCCT Hybrid Boolean Removal — Pure Native Booleans

**Date**: 2026-03-22
**Goal**: Fix `OCCTUnsupportedError: hybrid boolean: non-manifold OCCT mesh` by removing the hybrid Manifold boolean system and using pure OCCT native booleans.

## Root Cause

The error chain for `ams_lite_adapter.forge.js`:

1. `union(...cutters)` — filleted polygon extrusions fail OCCT→Manifold tessellation. Falls back to `occtNativeBoolean` (allowed because no sentinels). Returns a regular OCCT shape.
2. `union(baseCyl, flange)` — clean cylinders tessellate fine. Returns a ManifoldSentinel via hybrid boolean.
3. `body.subtract(cuts)` — one operand is ManifoldSentinel, other is OCCT shape that also fails tessellation. `conversionFailed=true` + `hasSentinel=true` → throws `OCCTUnsupportedError('hybrid boolean: non-manifold OCCT mesh')`.

**The mixing of ManifoldSentinels and OCCT shapes within the same pipeline created an irrecoverable state.**

## Fix (P1 from occt-purity plan)

Replaced `hybridBooleanViaManifold` with `occtNativeBoolean` in `lowerBooleanPlan`. Removed the entire Manifold sentinel system:

- Deleted: `MANIFOLD_SENTINEL`, `isManifoldSentinel`, `wrapManifoldSentinel`
- Deleted: `tessellateOCCTShape`, `buildMergeMaps`, `occtShapeToManifold`, `hybridBooleanViaManifold`
- Removed: sentinel checks in transform, fillet, chamfer, trimByPlane
- Removed: sentinel→ManifoldShapeBackend conversion in `lowerShapeCompilePlanToOCCTBackend`
- Removed: imports of `wrapManifoldShapeBackend` and `getWasm`

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | Model crashes with OCCTUnsupportedError | ❌ |
| P1 | Pure native OCCT booleans | Compiles, no new test failures, ~170 lines removed | ✅ |

## Lessons

1. **Backend purity prevents impossible states** — the hybrid system created ManifoldSentinels that propagated through the OCCT pipeline, blocking fillet/chamfer/trimByPlane and creating irrecoverable mixed-backend situations.
2. **OCCT native booleans handle coincident geometry** — the hybrid approach was introduced defensively, but OCCT's BRepAlgoAPI handles the tested cases correctly. The defensive complexity was worse than the problem it solved.
3. **Sentinel patterns are contagious** — once a ManifoldSentinel entered the pipeline, every downstream operation needed sentinel-aware code paths. Pure backends eliminate this entire class of bugs.

## Files Modified

| File | Change |
|------|--------|
| `src/forge/backends/occt/lower.ts` | Removed hybrid boolean system (~170 lines), use native OCCT booleans |

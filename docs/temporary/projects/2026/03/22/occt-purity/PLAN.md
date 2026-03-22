# OCCT Backend Purity — Eliminate Manifold Fallbacks

**Date**: 2026-03-22
**Goal**: Make `compilePlanOCCT.ts` fully self-contained with zero Manifold dependencies. Every operation that the compile plan IR describes should be lowered to native OCCT APIs.

## Current State (Baseline)

`compilePlanOCCT.ts` falls back to Manifold in 5 places:

| # | Operation | Current behavior | Manifold dependency |
|---|-----------|-----------------|-------------------|
| 1 | **3D Booleans** | `hybridBooleanViaManifold()` tessellates OCCT → Manifold mesh → boolean → sentinel | `getWasm().Manifold.union/subtract/intersection` |
| 2 | **Loft** | `throw OCCTUnsupportedError('loft')` → full Manifold fallback | Caller catches, runs Manifold pipeline |
| 3 | **Sweep** | `throw OCCTUnsupportedError('sweep')` → full Manifold fallback | Caller catches, runs Manifold pipeline |
| 4 | **Hull** | `throw OCCTUnsupportedError('hull')` → full Manifold fallback | Caller catches, runs Manifold pipeline |
| 5 | **Extrude with scaleTop** | `throw OCCTUnsupportedError('extrude with scaleTop')` | Caller catches, runs Manifold pipeline |

Additionally, the **Manifold sentinel system** (lines 29–48, 618–672) propagates through transforms, and blocks fillet/chamfer/trimByPlane after any boolean.

## Architecture Summary

```
ShapeCompilePlan (backend-agnostic IR)
    |
    +---> compilePlanOCCT.ts -------> OCCTShapeBackend (or ManifoldShapeBackend via sentinel!)
    |
    +---> compilePlanManifold.ts ---> ManifoldShapeBackend
```

After this work:
```
ShapeCompilePlan (backend-agnostic IR)
    |
    +---> compilePlanOCCT.ts -------> OCCTShapeBackend (always, no sentinel)
    |
    +---> compilePlanManifold.ts ---> ManifoldShapeBackend
```

## OCCT API Availability (Verified)

All required APIs are present in `opencascade.js@2.0.0-beta.b5ff984`:

| API | Purpose | Status |
|-----|---------|--------|
| `BRepAlgoAPI_Fuse_3` / `_Cut_3` / `_Common_3` | Native 3D booleans | Available, tested |
| `BRepOffsetAPI_ThruSections` | Loft (interpolate between wire sections) | Available, tested |
| `BRepOffsetAPI_MakePipe_1` | Sweep (extrude profile along spine wire) | Available, tested |
| `BRepOffsetAPI_MakePipeShell` | Advanced sweep with framing control | Available, tested |
| `GeomAPI_PointsToBSpline_2` | Smooth spline from polyline points | Available |
| `TColgp_Array1OfPnt_2` | Point array for spline construction | Available |

**Hull**: No native OCCT convex hull API. Will compute inline using tessellation + Manifold.hull + convert back to OCCT shape (contained within the file, not a full pipeline fallback).

## Experiment Plan

### P1: Native OCCT Booleans (replace hybrid Manifold)

**What**: Remove `hybridBooleanViaManifold()`, `MANIFOLD_SENTINEL`, `occtShapeToManifold()`, `tessellateOCCTShape()`, `buildMergeMaps()`. Use `occtNativeBoolean()` directly.

**Why**: Tested all four coincident-geometry cases (adjacent faces, overlapping, coplanar base, identical boxes) — OCCT handles them correctly. The hybrid approach was defensive but unnecessary, and it breaks downstream fillet/chamfer/trimByPlane.

**Risk**: Some exotic coincident geometry might fail. Mitigation: `HasErrors()` check on the boolean result.

### P2: Native Loft via BRepOffsetAPI_ThruSections

**What**: Convert each `ProfileCompilePlan` to an OCCT wire at its corresponding height, feed to `ThruSections(isSolid=true, isRuled=false)`.

**Mapping**: `plan.profiles[i]` → `lowerProfileToFace()` → extract outer wire → translate to `z = plan.heights[i]` → `AddWire()`.

### P3: Native Sweep via BRepOffsetAPI_MakePipe

**What**: Convert `SweepPathCompilePlan.points` to an OCCT wire spine (polyline edges). Convert profile to face at spine start. `MakePipe(spine, profile)`.

**For smooth paths**: Use `GeomAPI_PointsToBSpline` to create a B-spline curve from path points, then make a wire from that curve.

### P4: Hull (inline Manifold, no full fallback)

**What**: Instead of throwing `OCCTUnsupportedError`, compute hull inline:
1. For each shape operand: lower to OCCT, tessellate, extract vertices
2. For point operands: use directly
3. Call `Manifold.hull()` on the combined point cloud
4. Convert result back to OCCT compound shape

This keeps `compilePlanOCCT.ts` as the controlling pipeline. The Manifold usage is a contained utility, not a pipeline escape.

### P5: Extrude with scaleTop via ThruSections

**What**: 2-section loft — bottom wire at z=0 (original profile), top wire at z=height (scaled profile).

### P6: Remove all Manifold imports

**What**: After P1–P5, remove all Manifold-related code:
- `MANIFOLD_SENTINEL` type/functions
- `getWasm()` import
- `wrapManifoldShapeBackend` import
- `hybridBooleanViaManifold`, `occtShapeToManifold`, `tessellateOCCTShape`, `buildMergeMaps`
- Sentinel checks in transform/fillet/chamfer/trimByPlane

Exception: P4 (hull) may still need a contained `getWasm()` call for `Manifold.hull()`. This is acceptable — it's a utility, not a pipeline escape.

### P7: Build + Test

Verify: `npm run build:cli && node dist-cli/forgecad.js check suite`

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | 5 Manifold fallbacks, sentinel system | |
| P1 | Native OCCT booleans | Removed hybrid boolean + sentinel system (~170 lines). Triggered by ams_lite_adapter.forge.js crash. | ✅ DONE |
| P2 | Native loft (ThruSections) | | |
| P3 | Native sweep (MakePipe) | | |
| P4 | Hull (inline Manifold) | | |
| P5 | Extrude scaleTop (ThruSections) | | |
| P6 | Remove Manifold imports | | |
| P7 | Build + test | | |

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/compilePlanOCCT.ts` | Main target — all changes here |

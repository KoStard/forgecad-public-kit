# OCCT Performance: ThruSections Loft Timeout

## Goal & Current State

**Goal**: Make `curves-surfacing-basics.forge.js` execute within the 30s UI timeout with the OCCT backend.

**Baseline**: The first `loft()` call never completed — `ThruSections.Build()` hung indefinitely with 5 profiles of 120+ polygon edges each.

**Result**: Script evaluation dropped from ∞ (timeout) to **11.2 seconds**. All 3 shapes render correctly.

## Architecture Summary

```
spline2d(12 pts, samplesPerSegment:10, closed:true)
  → sampleCatmullRom2D() → 120-point polygon
  → .offset(corner * 0.08, 'Round') → ~224-edge wire
  → ProfileCompilePlan { kind: 'offset', base: { kind: 'polygon' } }

loft([5 profiles], [5 heights])
  → lowerLoftPlan()
    → lowerProfileToFace() × 5  (each ~50ms)
    → extractOuterWire() → 224-edge polygon wire
    → toBSplineWireIfNeeded() → 1-edge B-spline wire  ← NEW
    → BRepOffsetAPI_ThruSections.Build()
```

**Root cause**: OCCT's `BRepOffsetAPI_ThruSections` performance is O(n²) or worse in the number of wire edges. With 224 line-segment edges per profile × 5 profiles, it hangs. Converting to a single B-spline edge per profile makes it complete in milliseconds.

## Progress Tracker

| # | Change | ThruSections | Boolean | Total | Status |
|---|--------|-------------|---------|-------|--------|
| — | Baseline (224-edge polygons) | >60s (hangs) | — | timeout | Baseline |
| P1 | B-spline wire conversion (all pts) | ~200ms | 4.9s | 11.2s | ✅ Fixed |
| P1a | B-spline wire (subsampled 80pts) | ~100ms | 22s | 23s | ❌ Worse |

## Experiment Log

#### Baseline (MEASURED)
**What**: Run curves-surfacing-basics.forge.js with OCCT backend as-is.
**Result**: Profile prep: 5 × ~50ms. ThruSections.Build: never completes (>60s).
**Why**: 224 linear BRep edges per wire after offset. OCCT's ThruSections performs compatibility checking and parametric surface fitting across all edges — O(n²) or worse.

#### P1: B-spline Wire Conversion — All Points (SUCCESS)
**What**: Added `toBSplineWireIfNeeded()` — when a wire has >20 edges, extract vertices, fit a `GeomAPI_PointsToBSpline` curve, create a single-edge wire.
**Result**: Lofts: 2.4s each (including ~400ms B-spline fit × 5 profiles). Boolean: 4.9s. Total: 11.2s.
**Why it worked**: ThruSections with 1-edge B-spline wires is ~1000× faster than with 224-edge polygon wires. The smooth B-spline surfaces also produce faster boolean intersections.
**Lesson**: OCCT algorithmic complexity is dominated by edge count, not geometric complexity. One smooth B-spline edge is vastly better than many linear edges for surfacing operations.

#### P1a: B-spline Wire Conversion — Subsampled 80 Points (FAILED)
**What**: Same as P1 but subsampled wire points to 80 before B-spline fitting (to speed up the fit itself).
**Result**: Lofts: 0.6s each (faster fit). Boolean: **22s** (4.5× slower!). Total: 23s.
**Why it failed**: Fewer fit points → less smooth B-spline → harder boolean intersection topology. The B-spline fit cost (400ms) is a minor fraction compared to the boolean savings from smoother surfaces.
**Lesson**: For B-rep workflows, surface smoothness dominates downstream performance. Never sacrifice surface quality to save on fitting cost.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/backends/occt/lower.ts` | B-spline wire conversion for ThruSections (loft, twist extrude, scale-top extrude) |
| `examples/api/curves-surfacing-basics.forge.js` | Removed `smoothOut`/`refine` calls (Manifold-only, not in public API) |

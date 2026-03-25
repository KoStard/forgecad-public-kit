# OCCT Performance Investigation

## Goal & Current State

**Goal**: Make ForgeCAD models execute within the 30s UI timeout with the OCCT backend.

**Result**: Identified and fixed the critical loft hang. Identified text2d as the main remaining bottleneck (~4s per label). Added a runtime warning for text2d on OCCT. Assembly dropped from timeout → 17s after user removed text labels.

## Progress Tracker

| # | Change | Target | Before | After | Status |
|---|--------|--------|--------|-------|--------|
| P1 | B-spline wire conversion for ThruSections | curves-surfacing-basics | timeout (∞) | 11.2s | ✅ |
| P2 | N-shape boolean strategies | fruit robot parts | varies | no universal winner | ❌ Reverted |
| P3 | text2d OCCT warning | all models with text | silent slowdown | console warning | ✅ |

## Experiment Log

### P1: B-spline Wire Conversion for ThruSections (SUCCESS)

**What**: When a wire has >20 edges, extract vertices, fit `GeomAPI_PointsToBSpline`, create a 1-edge wire. Applied to loft, twist-extrude, and scale-top-extrude ThruSections paths.

**Result**: `curves-surfacing-basics.forge.js` dropped from ∞ (timeout) to 11.2s.

**Root cause**: `spline2d()` samples Catmull-Rom → 120-point polygon → offset → 224-edge wire. `BRepOffsetAPI_ThruSections` is O(n²+) in wire edge count. With B-spline wires (1 edge each), ThruSections completes in ~200ms.

**Key finding**: Surface smoothness matters — subsampling to fewer fit points made B-spline fitting 4× faster but boolean operations 4.5× slower (5s → 22s). All points = best overall.

### P2: Multi-Tool Boolean Strategies (FAILED — No Universal Winner)

**What**: Tested three strategies for `.subtract(many tools)`:
1. **N-shape API** (original): `BRepAlgoAPI_Cut_1` with all tools at once
2. **Sequential pairwise**: `A - B`, then `(A-B) - C`, then...
3. **Fuse-then-cut**: Fuse all tools, then single cut

**Results**:

| File (tool count) | N-shape | Sequential | Fuse-then-cut |
|-------------------|---------|------------|---------------|
| base-plate (52 cylinders) | **10.8s** | 15.7s | 12.2s |
| motor-mount (10 tools) | **0.5s** | 2.2s | 0.75s |
| peeling-arm (20 polygon extrusions) | 9.5s | **4.5s** | 8.4s |

**Why no winner**: N-shape is fast for simple non-overlapping tools (cylinders in a grid). Sequential wins for complex polygon-based tools. No static threshold correctly distinguishes these cases.

### P3: text2d OCCT Warning (SUCCESS)

**What**: Added `console.warn()` in `text2d()` when OCCT backend is active, warning users that text engraving is slow.

**Why**: text2d produces extremely dense glyph polygons via bezier curve sampling. A single "PEELBOT v1" label costs ~4s in OCCT (1.8s extrude + 2.2s subtract) vs 42ms in Manifold. This was the single biggest contributor to the fruit robot assembly timeout.

**Impact**: User removed 2 text labels → assembly dropped from 32.5s to 17s.

## Emerging Pattern: Why OCCT Is Slow

Three categories:

### 1. ThruSections with High-Edge-Count Wires (FIXED)
- **Trigger**: `spline2d()` / `offset()` → many-edge polygon wires → loft/sweep
- **Cost**: O(n²+) — hangs indefinitely with >100 edges
- **Fix**: B-spline wire conversion reduces to 1 edge per wire

### 2. Boolean Operations Scale with Shape + Tool Complexity
- **Trigger**: `.subtract(many tools)` or booleans on complex B-rep shapes
- **Cost**: Inherent to B-rep topology evaluation. No universal optimization.

### 3. text2d Produces Extremely Dense Geometry (WARNED)
- **Trigger**: `text2d()` → bezier glyph sampling → hundreds of polygon points per character
- **Cost**: ~4s per text label in OCCT
- **Mitigation**: Runtime warning tells users to expect slowness or remove text

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/backends/occt/lower.ts` | B-spline wire conversion for ThruSections |
| `src/forge/sketch/text.ts` | OCCT performance warning for text2d |
| `examples/api/curves-surfacing-basics.forge.js` | Remove Manifold-only smoothOut/refine calls |

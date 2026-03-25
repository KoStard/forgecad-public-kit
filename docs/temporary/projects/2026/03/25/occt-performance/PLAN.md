# OCCT Performance Investigation

## Goal & Current State

**Goal**: Make ForgeCAD models execute within the 30s UI timeout with the OCCT backend.

## Architecture Summary

OCCT operations flow: `CompilePlan → lower.ts → OCCT WASM → TopoDS_Shape → tessellation → mesh`

The 30s timeout covers script evaluation only (WASM init has a separate 120s timeout).

## Progress Tracker

| # | Change | Target | Before | After | Status |
|---|--------|--------|--------|-------|--------|
| P1 | B-spline wire conversion for ThruSections | curves-surfacing-basics | timeout (∞) | 11.2s | ✅ |
| P2 | N-shape boolean strategies | fruit robot parts | varies | no clear winner | ❌ Reverted |
| — | Assembly (sum of parts) | fruit robot assembly | ~33s | 32.5s | ⚠️ Borderline |

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
| base-plate (52 tools) | **10.8s** | 15.7s | 12.2s |
| motor-mount (10 tools) | **0.5s** | 2.2s | 0.75s |
| peeling-arm (20 tools) | 9.5s | **4.5s** | 8.4s |
| carriage (moderate) | **0.6s** | 1.4s | 0.8s |

**Why no winner**: N-shape is fast when tools are simple non-overlapping primitives (cylinders in a grid). Sequential is faster when tools are complex shapes that cause expensive interference detection. No static threshold correctly distinguishes these cases.

**Decision**: Keep N-shape API (original). Most models have simple tools (holes, slots). The peeling-arm case (9.5s) is within the 30s timeout individually.

### Fruit Robot Part Benchmarks

| Part | OCCT Time | Main Cost |
|------|-----------|-----------|
| base-plate | 11.8s | text2d engraving (4s) + 52 mount holes |
| blade-holder | 8.8s | 1× loft + 3× sweep (B-spline curves) |
| peeling-arm | 9.5s | 20-tool boolean (complex polygon shapes) |
| waste-tray | 0.8s | Simple booleans |
| fruit-chuck | 0.8s | Simple booleans |
| carriage | 0.6s | Simple booleans |
| motor-mount | 0.5s | Simple booleans |
| **Assembly** | **32.5s** | Sum of all parts (19 objects) |

## Emerging Pattern: Why OCCT Is Slow

Three categories of slow OCCT operations:

### 1. ThruSections with High-Edge-Count Wires (FIXED by P1)
- **Trigger**: `spline2d()` → polygon sampling → many-edge wire → loft/sweep
- **Cost**: O(n²+) in wire edge count. 120+ edges = hangs indefinitely.
- **Fix**: Convert polygon wires to B-spline wires before ThruSections.

### 2. Boolean Operations Scale with Shape Complexity
- **Trigger**: Many `.subtract()` or `.add()` operations accumulate faces/edges
- **Cost**: Each boolean must evaluate full topology. 50+ simple holes = ~0.5s. Complex polygon tools = 9.5s.
- **No easy fix**: This is fundamental to B-rep boolean evaluation. Could batch similar operations but no universal strategy wins.

### 3. text2d Produces Extremely Complex Profiles
- **Trigger**: `text2d("PEELBOT v1")` → complex glyph polygons → extrude → subtract
- **Cost**: Text extrude = 1.8s, text boolean subtract = 2.2s = ~4s total per text label
- **Potential fix**: Reduce text polygon complexity, or defer text engraving to export-only quality.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/backends/occt/lower.ts` | B-spline wire conversion for ThruSections |
| `examples/api/curves-surfacing-basics.forge.js` | Remove Manifold-only smoothOut/refine calls |

# Surface Selection UX for Multi-Surface Constrained Sketches

## Goal & Current State

**Goal**: Make it easy and intuitive to choose which surface(s) to extrude from complex multi-surface constrained sketches. Currently the workflow is purely programmatic — users must either know seed point coordinates or call `detectArrangement()` and index into the result array. There's no visual feedback about what surfaces exist, no labeling, and no diagnostic output.

**Current State (Baseline)**:
- `detectArrangement()` returns `Sketch[]` sorted largest-first — no labels, no metadata
- `detectArrangementRegion(seed)` requires knowing a point inside the desired region — trial and error
- CLI output shows constraint status but **zero information about detected surfaces**
- Browser viewport shows edges but **no surface fills or region visualization**
- SVG export shows wireframe only — no region identification
- No `console.log` or debug output for surfaces at all
- When a user picks the wrong seed point, the error message says "not inside any of N regions" but doesn't tell them where the regions actually are

**Pain Points**:
1. User doesn't know how many surfaces exist until they call `detectArrangement()` and check `.length`
2. User doesn't know where each surface is (center, bounds, area) without manual inspection
3. No visual feedback — can't "see" regions in the viewport or SVG
4. Seed-point selection is blind — no guidance on valid seed locations
5. When extrusion fails because "no loop" or wrong region, debugging is opaque

## Architecture Summary

### Surface Detection Pipeline
```
ConstrainedSketchBuilder
  → .solve() → ConstraintSketch (extends Sketch)
    → .detectArrangement() → Sketch[] (DCEL face traversal)
    → .detectArrangementRegion(seed) → Sketch (point-in-polygon)
```

### Key Files
| File | Role |
|------|------|
| `src/forge/sketch/arrangement.ts` | DCEL arrangement detection algorithm |
| `src/forge/sketch/regions.ts` | Boolean sketch region decomposition |
| `src/forge/sketch/constraints/sketch.ts` | ConstraintSketch class, solve pipeline |
| `src/forge/sketch/constraints/types.ts` | SketchConstraintMeta, ConstraintDisplay |
| `src/forge/sketch/constraints/builder.ts` | Builder API (addLoop, point, line) |
| `cli/test-run.ts` | CLI output formatting |
| `cli/sketch-svg.ts` | SVG export rendering |
| `src/components/Viewport.tsx` | Browser 3D viewport |
| `src/components/ViewPanel.tsx` | Browser side panel |

### Detection Algorithm (arrangement.ts)
1. Extract non-construction line segments from solved definition
2. Split segments at all pairwise intersections (X-crossings + T-junctions)
3. Snap nearby nodes together (1e-6 tolerance)
4. Build directed half-edge graph, sort outgoing edges by polar angle per node
5. DCEL next-pointer formula traverses all face cycles
6. Keep only positive (CCW) signed-area faces → bounded regions
7. Return as `Sketch[]` sorted largest-first

## Alternatives Considered

### A1: Surface metadata on ConstraintSketch (chosen)
Add a `surfaces` array to `SketchConstraintMeta` with per-region metadata (index, area, centroid, bounds, seed point). Available in CLI, SVG, and browser without changing the detection algorithm.

**Pros**: Non-breaking, works across all outputs, cheap to compute
**Cons**: Adds to meta payload size

### A2: Interactive seed picker in viewport
Add a click-to-select-region interaction in the browser viewport — click inside a region, highlight it, show its index/area.

**Pros**: Most intuitive for visual users
**Cons**: Only works in browser, complex interaction model, doesn't help CLI users

### A3: Named regions via builder API
`sk.nameRegion("panel", [25, 30])` — let users name regions during sketch building, reference by name later.

**Pros**: Clean API, self-documenting code
**Cons**: Still requires knowing seed points, adds API surface

### A4: Console-only debug logging
Just `console.log` the surface list from `detectArrangement()`.

**Pros**: Trivial to implement
**Cons**: Only visible in console, no integration with SVG/viewport

### Decision
**Implement A1 first** (surface metadata in SketchConstraintMeta), then **A2** (viewport region visualization). A1 gives immediate value across all surfaces (CLI, SVG, browser). A2 builds on A1 for visual exploration.

## Progress Tracker

| # | Change | Surfaces Visible? | CLI Info? | SVG Info? | Viewport? | Status |
|---|--------|-------------------|-----------|-----------|-----------|--------|
| — | Baseline | No | No | No | No | ✅ |
| 1 | SurfaceDisplay type + buildSurfaceDisplays | — | — | — | — | ✅ |
| 2 | CLI surface listing | — | Yes | — | — | ✅ |
| 3 | SVG region fills + labels | — | Yes | Yes | — | ✅ |
| 4 | Viewport region fills + ViewPanel listing | — | Yes | Yes | Yes | ✅ |
| 5 | Click-to-highlight region | — | Yes | Yes | Interactive | future |

## Experiment Log

### Experiment 1: Circular dependency (RESOLVED)
**What**: Adding `import { computeArrangementFaces } from '../arrangement'` to `sketch.ts` created a circular dependency: sketch.ts → arrangement.ts → constraints/index.ts → sketch.ts
**Result**: Runtime crash — `ConstraintSketch.prototype` was undefined.
**Fix**: Extracted the pure DCEL algorithm into `arrangement-core.ts` with no ConstraintSketch dependency. `arrangement.ts` now imports from the core module. `sketch.ts` also imports only from the core module.
**Lesson**: Keep computational algorithms in dependency-free modules; prototype augmentation files should be leaves in the import graph.

### Experiment 2: Seed point for frame/ring regions (RESOLVED)
**What**: The centroid of a frame region (outer rect - inner rect) falls at the geometric center, which is inside the inner polygon — not a valid unique seed.
**Result**: Both frame and inner rectangle had seed=[60,50], making them indistinguishable.
**Fix**: Two-pass approach: (1) compute all faces, (2) for each face, try centroid first; if it's inside another polygon, try edge midpoints nudged by CCW inward normal. The key insight: for CCW polygons, the inward normal is the left-hand perpendicular (-dy, dx).
**Lesson**: Centroid-as-seed only works for convex non-overlapping polygons. Frame regions need edge-based seed computation.

### Experiment 3: Near-zero-area degenerate faces (RESOLVED)
**What**: The spiral stress test (50 segments with error accumulation) produced 21 "surfaces" — 15 of which had area ≈ 0mm² from slightly misaligned segment endpoints.
**Result**: Noise surfaces cluttered the output.
**Fix**: Filter out faces with area < 0.1mm². Spiral now shows 6 meaningful surfaces.
**Lesson**: Numerical imprecision in constrained solves creates phantom faces at error boundaries.

## Test Cases

Test files in `examples/constraints/` that exercise surface selection:

### 11-surface-grid.forge.js
3×2 grid (6 cells) — tests basic arrangement detection, surface listing, area computation.
Expected: 6 surfaces detected, each ~2500mm², centroids at grid cell centers.

### 12-surface-nested.forge.js
Outer rectangle with inner rectangle forming a frame — tests hole/frame topology.
Expected: 2 surfaces (frame ring + inner rectangle), correct areas.

### 13-surface-complex.forge.js
L-shaped profile with diagonal divider — tests non-rectangular regions, triangular faces.
Expected: Multiple surfaces with different shapes and areas.

## Files Modified

| File | Change |
|------|--------|
| `src/forge/sketch/constraints/types.ts` | Added `SurfaceDisplay` interface, `surfaces` field on `SketchConstraintMeta` |
| `src/forge/sketch/constraints/sketch.ts` | Added `buildSurfaceDisplays()`, imports from `arrangement-core.ts` |
| `src/forge/sketch/constraints/index.ts` | Re-exports `SurfaceDisplay` type |
| `src/forge/sketch/arrangement-core.ts` | **New** — pure DCEL algorithm extracted from `arrangement.ts` |
| `src/forge/sketch/arrangement.ts` | Refactored to use `arrangement-core.ts`, removed duplicated algorithm code |
| `src/forge/forge-api.d.ts` | Added `SurfaceDisplay` interface, `surfaces` on `SketchConstraintMeta` |
| `cli/test-run.ts` | Added surface listing output (count, area, centroid, seed) |
| `cli/sketch-svg.ts` | Added surface region fills and index labels to SVG |
| `cli/forge-svg.ts` | Fall back to constraint SVG for ConstraintSketch objects |
| `src/components/Viewport.tsx` | Added `surfaceFills` memo and colored fill mesh rendering |
| `src/components/ViewPanel.tsx` | Added surfaces section with color swatch, area, and seed |
| `examples/constraints/11-surface-grid.forge.js` | **New** — 3×2 grid test (6 surfaces) |
| `examples/constraints/12-surface-nested.forge.js` | **New** — nested rectangles test (frame + inner) |
| `examples/constraints/13-surface-complex.forge.js` | **New** — L-shape with diagonals test (3 surfaces) |

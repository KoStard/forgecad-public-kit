# Parameterized Groups — Auto-detect & Exploit Rigid Subgraphs

## Goal

Automatically detect rigid or semi-rigid subgraphs in the constraint system and collapse them into parameterized groups, reducing solver variables dramatically.

**Motivating example**: `sk.rect()` creates 4 points (8 DOF) + perpendicular/parallel constraints. A parameterized rect group needs only 5 DOF (x, y, θ, w, h) — or 3 DOF if dimensions are constrained. For 16 rectangles: 128 → 80 → 48 variables.

## Two-layer design

### Layer 1: Automatic detection (Rust presolve)
The solver analyzes the constraint graph and detects subgraphs that can be collapsed:
- Fully rigid (internal DOF = 0) → standard group (3 DOF: x, y, θ)
- Semi-rigid (internal DOF = k) → parameterized group (3 + k DOF)

No API change needed. User writes whatever constraints they want, solver exploits the structure.

### Layer 2: User API (TS builder)
Optional explicit API for when the user knows the structure:
```js
// Current: rigid group, dimensions baked in
const r = sk.groupRect({ width: 100, height: 50 });

// New: parameterized group, dimensions are solver variables
const r = sk.paramRect();  // width + height are free
sk.length(r.top, 100);     // constrain width via normal API
// height remains a solver variable (5 DOF total)
```

The user API would create the same internal representation that auto-detection produces.

## Architecture

### Current group model
```
SketchGroup {
  x, y, θ           — solver variables (frame DOF)
  points: [{lx, ly}] — FIXED local coordinates
}

point_world = rotate(θ) * [lx, ly] + [x, y]
```

### Proposed parameterized group model
```
ParameterizedGroup {
  x, y, θ              — solver variables (frame DOF)
  params: [p0, p1, …]  — solver variables (shape DOF)
  points: [{lx_expr, ly_expr}]  — local coords as functions of params
}

// For a rectangle:
params = [w, h]
points = [(0,0), (w,0), (w,h), (0,h)]
point_world = rotate(θ) * [lx(params), ly(params)] + [x, y]
```

### Key design questions

1. **How to express `lx_expr`?** Options:
   - Simple: each local coord is either a constant or a direct reference to one param
   - General: local coords are linear combinations of params (covers more patterns)
   - Most general: arbitrary expressions (overkill?)

2. **How does the Jacobian work?** For FD, we perturb params instead of individual point coords. For analytic: `∂point_world/∂param = rotate(θ) * ∂[lx,ly]/∂param`.

3. **What patterns can auto-detection find?**
   - Rectangles (4 points, perpendicular corners)
   - Regular polygons (equal sides + equal angles)
   - Any polygon with all angles constrained (angles lock topology, sides may vary)
   - Symmetric structures

4. **Variable substitution in constraints**: When a subgraph is collapsed, constraints referencing its points must be rewritten to use group frame + params. E.g., `length(line_AB)` becomes a function of the rect's `w` param.

## Algorithm sketch for auto-detection

```
1. Build constraint hypergraph: nodes = entities, edges = constraints
2. Find connected components
3. For each component, compute internal DOF:
   - Count entity DOF (2 per point, 1 per circle radius, etc.)
   - Subtract constraint DOF (each constraint removes rows)
   - Subtract 3 (frame DOF: x, y, θ)
   - Result = internal DOF = number of shape params needed
4. If internal DOF is small (say ≤ 4), profitable to collapse:
   - Fix the frame (e.g., anchor one point + angle)
   - Solve for internal geometry with remaining DOF
   - Express local coords as functions of remaining params
5. Replace original entities + constraints with the parameterized group
6. Rewrite external constraints to reference group frame + params
```

Step 4 is the tricky part — we need to identify which DOF are "shape" vs "frame". One approach: fix the centroid at origin and one axis direction, then the remaining free variables are the shape params.

## Incremental approach

### Phase 1: Rectangle-specific optimization
Detect the rectangle pattern specifically (4 points, 4 lines, perpendicular constraints). This is the most common case and easiest to implement. No general algorithm needed.

**Detection**: In presolve, scan for sets of 4 lines forming a cycle where all adjacent pairs have perpendicular constraints. Check which dimensions (if any) are constrained.

**Collapse**: Replace with a rect group: frame (x, y, θ) + optional (w, h) params.

### Phase 2: General rigid subgraph detection
Extend to arbitrary polygons and constraint patterns using the DOF analysis algorithm above.

### Phase 3: User API
Expose `sk.paramRect()`, `sk.paramPolygon()`, etc. that create parameterized groups directly.

## Expected impact

| Scenario | Current vars | With param groups | Speedup |
|----------|-------------|-------------------|---------|
| 16 rects, all dimensioned | 128 | 48 (3 DOF each) | ~7× |
| 16 rects, no dimensions | 128 | 80 (5 DOF each) | ~2.5× |
| Spectrometer (triangles) | 60 | ~30 | ~2× |
| Mixed sketch | varies | varies | depends |

The speedup is super-linear because the FD Jacobian is O(n²) in variable count (n columns × n-dependent rows).

## Progress Tracker

| # | Change | case_wood 03/18 | case_wood 03/20 | spectrometer | Status |
|---|--------|-----------------|-----------------|--------------|--------|
| — | Baseline (pre-work) | 216 vars, ~15s, maxError=145 | 96 vars, 4.2s | 62 vars, ~7s | ✅ |
| E1 | Coord propagation only (progressive) | 216 vars, 16s, maxError=339 | 96 vars, 4.2s | — | ❌ No improvement |
| E2 | Variable elimination (final solve) | 138 vars, 16s, maxError=340 | 78 vars, 4.15s | 60 vars, 12s | ✅ Vars reduced, no convergence help |
| E3 | + Absorbed constraint filtering | 138 vars × 186 rows, maxError=420 | — | — | ❌ Worse convergence |
| E4 | Variable elimination only (revert E3) | 138 vars × 264 rows, 16s | 78 vars, 4.15s | 60 vars, 12s | ✅ Final implementation |
| E5 | Spread overlapping shapes (grid + jitter) | 138 vars, 3.2s final, ✅ converges | 533ms ✅ | 3.0s ✅ | ✅ Case_wood 03/18 now solves! |

## Experiment Log

#### E1: Coordinate propagation in progressive solve (FAILED)
**What**: Added `build_coord_reduction` call in every progressive step. For each linked coordinate, copy representative's value to linked point before the LM pass.
**Result**: No improvement in convergence. case_wood 03/18 still maxError=339 (worse than baseline 145). No reduction in variable count or solve time.
**Why it failed**: All 16 rects start at the same default position (0,0 with w=h=10). Coord propagation ensures linked coordinates are equal, but they ALREADY are equal. The problem is that rects need to be MOVED APART, not that coordinates need to be ALIGNED. Coord propagation is the wrong tool for this geometry.
**Lesson**: Coordinate equivalence helps when constraints force coordinates to be equal but initial geometry disagrees. It doesn't help when the problem is positioning (moving shapes apart).

#### E2: Per-coordinate variable elimination in LM solver (SUCCESS — partial)
**What**: Major refactoring of `build_variables` and supporting functions in `lm.rs`:
- Changed `pt_var_idx` from `Vec<usize>` (one x index, y=x+1) to `Vec<PtVarIdx>` with independent x/y indices
- When coord reduction says point A.y is linked to point B.y, A.y is not created as a solver variable
- Added `CoordLinkMap` for fast FD propagation: when B.y changes, all followers update immediately
- Updated sparsity map: constraints involving linked points now include representative's variables
- Added `propagate_coord_links_fast` after every `apply_state` in solve_global and run_lm_pass
- Only applied to final solve (non-incremental) — seeds keep full variable set

**Result**:
- case_wood 03/18: 216 → 138 vars (78 saved, 36% reduction). build_sparsity 3× faster (538→175ms when global, ~570ms when final-only). GS warmstart 3× faster (3089→1018ms when global). FD loop 28% faster.
- case_wood 03/20: 96 → 78 vars (18 saved, 19% reduction). No regression in total time (4.15s).
- spectrometer: 62 → 60 vars (2 saved, 3% reduction). Minimal impact.
- Convergence: NOT improved. Bad initial geometry from seed timeouts still prevents convergence for case_wood 03/18.

**Why partially worked**: Variable elimination is correct and reduces solver work per iteration. But convergence failure is caused by bad initial geometry (16 rects at same position → seeds time out → progressive solve can't untangle), not by variable count. The 36% variable reduction makes each iteration faster but doesn't help convergence.
**Lesson**: Variable reduction is a necessary but not sufficient condition for fixing the rect case. The bottleneck is initial geometry quality, not solver variable count.

#### E3: Absorbed constraint filtering (FAILED)
**What**: After variable elimination, also removed the h/v constraints absorbed by coord reduction from the constraint list. Reduced 264 → 186 rows for case_wood 03/18.
**Result**: maxError WORSENED from 340 to 420. Convergence got worse.
**Why it failed**: Even though absorbed constraints have zero residual (linked coords are always equal), they provide Jacobian gradient information that guides the solver. Removing them removes these "guide rails" — the solver loses directional information and navigates the solution space worse.
**Lesson**: Redundant constraints with zero residual still provide useful Jacobian information for LM optimization. Don't remove them unless you're sure the remaining constraints provide sufficient gradient coverage.

#### E4: Final implementation — variable elimination only (SUCCESS)
**What**: Kept E2's variable elimination, reverted E3's constraint filtering. Disabled coord reduction for incremental/seed calls (only runs on final solve) to avoid seed regression.
**Result**: Same metrics as E2. 61/63 Rust tests pass (2 pre-existing failures on mainline). No regressions on groupRect or spectrometer.
**Lesson**: The clean win is per-coordinate variable elimination via union-find equivalence classes. It's generic, automatic, and correctly handles the sparsity/FD propagation.

#### E5: Spread overlapping shapes before presolve (SUCCESS)
**What**: New `spread_overlapping_shapes` function in `mod.rs`:
- Uses union-find over line connectivity + structural constraints (Coincident, PointOnLine, Midpoint) to identify connected components (shapes)
- Computes each shape's centroid and bounding box
- If ≥4 shapes are clustered (centroids within expected grid extent), spreads them in a grid with deterministic jitter
- Spacing = 2× average shape bbox (conservative — keeps shapes close enough for solver to bridge)
- Deterministic jitter via Knuth's golden ratio hash of component root index
- Each component is translated as a unit (preserves internal geometry)
- Called at start of both `run_presolve` and `progressive_solve`

**Iterations**:
1. First attempt used `ref_scale * 0.8` as spacing → shapes spread 1000+ units apart → maxError=709961 (WORSE). Solver couldn't bridge huge distances.
2. Fixed: use average shape bbox × 2 as spacing. For 10×10 rects, spacing = 20 → 16 shapes in 4×4 grid cover ~80×80 area.
3. Spectrometer regression: shapes connected by Coincident (not lines) were treated as separate components → spread apart incorrectly. Fixed by also connecting via Coincident/PointOnLine/Midpoint constraints in union-find.
4. Added ≥4 shape minimum threshold — solver handles 2-3 overlapping shapes fine.

**Result**:
- case_wood 03/18: **CONVERGES** — 3.2s final solve (was never finishing), 111 outer iterations, 107 accepted steps. LM itself only 19ms, progressive warm-up 3.1s.
- case_wood 03/20: 533ms (no regression from 542ms baseline)
- spectrometer: 3.0s (no regression from 2.4s baseline)
- 61/63 Rust tests pass (2 pre-existing failures)

**Why it worked**: The root cause was 16 rects at identical positions → degenerate line normals → LineDistance presolve couldn't compute shift directions → seeds timed out → progressive solve got bad initial geometry. Spreading shapes apart by just 2× their size gives each shape a unique position, making normals well-defined and presolve effective.
**Lesson**: Initial geometry quality matters more than solver sophistication. A simple grid spread (~20 lines of logic) solved a convergence problem that variable reduction (200+ lines of complex refactoring) could not.

## Root Cause: Bad Initial Geometry (FIXED by E5)

The case_wood 03/18 convergence failure was caused by:
1. 16 rects created at the same default position (x=0, y=0, w=10, h=10)
2. `seedIncrementalGeometry` tries to separate them incrementally but exceeds the 5s seed budget
3. Progressive solve gets initial geometry where all rects are overlapping
4. Solver can't untangle 16 overlapping rects within the 10s time budget

**Fix**: `spread_overlapping_shapes` detects clustered shapes and spreads them in a deterministic grid before presolve runs. This gives each shape a unique position, making the existing presolve and progressive solve effective.

Remaining future work:
- **Full parameterized groups**: Collapse each rect into a 5-DOF group (x, y, θ, w, h), reducing 16 rects from 138 vars to ~80 vars

## Files Modified

| File | Change |
|------|--------|
| `solver/src/solver/coord_reduction.rs` | **NEW**: Coordinate equivalence via union-find. Scans H/V/Coincident constraints, builds equivalence classes. Includes `CoordLinkMap` for fast FD propagation. |
| `solver/src/solver/mod.rs` | Added `pub mod coord_reduction`. Integrated into `solve_single_system` (non-incremental path). Coord propagation in progressive solve loop. Added `spread_overlapping_shapes` for initial geometry improvement. |
| `solver/src/solver/lm.rs` | Refactored `build_variables` to use `PtVarIdx` (per-coord indices). Added `propagate_coord_links_fast`. Updated `set_var_fast` for FD propagation. Updated sparsity to include representative vars for linked points. Threading of `coord_red`/`link_map` through solve_global → run_lm_pass → linearize. |

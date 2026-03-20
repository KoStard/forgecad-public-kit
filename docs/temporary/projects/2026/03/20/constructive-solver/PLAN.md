# Constructive-First Solver: Reconstruction Graph Architecture

## Goal

Replace the current "constructive placement + mark fixed" approach with a **reconstruction graph** — a dependency DAG that reduces LM's variable count by identifying points whose positions are functions of other variables. This is the generalization of SketchGroup's rigid-body frame to arbitrary constructive constraint patterns.

## Why

1. **Correctness**: The current `analytical.rs` patterns mark constructively-solved points as `fixed = true`. If the constructive solver picks the wrong branch (e.g., wrong circle-circle intersection), LM can't recover. This is why the 4 existing patterns were dead code — they broke the spectrogram.

2. **Performance**: Every variable removed from LM saves cubic time (Cholesky on normal equations). A fully constructively-determined sketch solves in zero LM iterations.

3. **Incremental caching**: The dependency DAG tells you exactly which points are invalidated by a parameter change, enabling targeted re-solve instead of full re-solve.

## Architecture Summary

### Current state

```
solve_single_system():
  run_presolve()              — Fixed, CCW, BlockRotation, AbsoluteAngle, Length
  run_analytical_presolve()   — Coincident + HDistance/VDistance → marks fixed=true
  resolve_group_points()      — Group frame → owned points
  LM(all non-fixed points)
```

SketchGroup is a special case: group-owned points aren't LM variables. Instead, the group frame (x, y, θ) is optimized, and `resolve_group_points()` recomputes owned points before each residual evaluation. FD through this reconstruction gives correct Jacobians automatically.

### Target state

```
solve_single_system():
  run_presolve()              — same
  build_reconstruction_graph() — analyze constraint graph, classify points
  reconstruct()               — compute all determined point positions
  LM(independent variables only, with reconstruct() before each residual eval)
```

The reconstruction graph subsumes:
- `run_analytical_presolve()` (constructive patterns)
- `resolve_group_points()` (group frames)
- Future: any constraint pattern that can be solved in closed form

### Key design decisions

**1. Variable elimination, not fixation.** Determined points are removed from LM's variable list (like group-owned points), not marked `fixed = true`. The reconstruction function recomputes them from their dependencies.

**2. Consumed vs remaining constraints.** When the reconstruction determines a point using constraints C1 and C2, those constraints are "consumed" — they're satisfied by construction and removed from LM residuals. Other constraints involving the same point but also involving free entities remain as LM residuals.

**3. Branch resolution.** For patterns with discrete ambiguity (circle-circle has 2 solutions), the branch is chosen by evaluating remaining (non-consumed) constraints at each candidate and picking the lower-residual one. This replaces `pick_closest` (which uses unreliable initial positions).

**4. FD through reconstruction.** The Jacobian for free variables that affect reconstructed points is computed via FD through the reconstruction step — exactly the same mechanism as group variables today. No analytic chain rules needed.

## Investigation Learnings (E1)

- Wiring up the 4 dead-code patterns in `analytical.rs` and marking points `fixed = true` **broke the spectrogram** — equilateral triangle vertices were placed at wrong circle-circle intersections because initial positions were garbage `(1,1)`, `(0,5)`.
- The spectrogram went from 7 surfaces (correct) to 37 surfaces (broken geometry).
- Root cause: `pick_closest` uses initial position for branch selection, which is meaningless for placeholder positions.
- Restoring fixed flags after LM didn't help — the damage was done during analytical presolve when wrong positions were locked in.

## Implementation Phases

### Phase 1: Reconstruction graph data structure + analysis (no behavioral change)

**Files**: `solver/src/solver/reconstruction.rs` (new)

Create the reconstruction graph data structure and the analysis pass that builds it from constraints + known points. No changes to solver behavior — just analysis that can be logged and tested.

```rust
/// A step in the reconstruction: computes one point from known dependencies.
enum ReconstructionStep {
    /// target.xy = source.xy (coincident)
    Coincident { target_idx: usize, source_idx: usize, constraint_idx: usize },
    /// target.x = anchor.x + dx, target.y = anchor.y + dy (hDist + vDist)
    Offset { target_idx: usize, anchor_idx: usize, dx: f64, dy: f64, constraint_indices: [usize; 2] },
    /// target at intersection of two distance circles from known centers
    CircleCircle { target_idx: usize, c1_idx: usize, r1: f64, c2_idx: usize, r2: f64, constraint_indices: [usize; 2] },
    /// target at intersection of line (from known horizontal/vertical/pointOnLine) + distance circle
    LineCircle { target_idx: usize, /* line params */ circle_center_idx: usize, radius: f64, constraint_indices: Vec<usize> },
    /// target.x = anchor.x + dx, target.y from distance circle (hDist + distance)
    HDistCircle { target_idx: usize, anchor_idx: usize, dx: f64, dist_anchor_idx: usize, dist: f64, constraint_indices: [usize; 2] },
    /// target.y = anchor.y + dy, target.x from distance circle (vDist + distance)
    VDistCircle { target_idx: usize, anchor_idx: usize, dy: f64, dist_anchor_idx: usize, dist: f64, constraint_indices: [usize; 2] },
}

struct ReconstructionGraph {
    /// Ordered steps — dependencies are resolved by ordering.
    steps: Vec<ReconstructionStep>,
    /// Point indices that are fully determined (skip in LM variables).
    determined_point_indices: HashSet<usize>,
    /// Constraint indices consumed by reconstruction (skip in LM residuals).
    consumed_constraint_indices: HashSet<usize>,
}
```

**Analysis algorithm** (fixed-point iteration, like current analytical presolve):
1. Start with `known = { fixed points, group-owned points }`
2. For each unknown point, try patterns against constraints involving it and known points
3. When a pattern matches, add a `ReconstructionStep`, mark the point as known, mark the consumed constraints
4. Repeat until no progress

**Testing**: Log the graph for spectrogram and challenge files. Verify which points are identified as determined without changing solver behavior.

### Phase 2: Reconstruction execution + variable elimination

**Files**: `solver/src/solver/reconstruction.rs`, `solver/src/solver/lm.rs`, `solver/src/solver/mod.rs`

Wire the reconstruction graph into the solver:

1. **`reconstruct()`**: Execute all steps in order, setting point positions from formulas. For branch choices (CircleCircle), evaluate remaining constraints at both candidates, pick lower residual.

2. **`build_variables()`**: Skip points in `determined_point_indices` (same as group-owned skip).

3. **Sparsity map**: Route constraints involving determined points to their dependency chain's free variables (analogous to how group-owned points route to group frame variables).

4. **FD integration**: After perturbing any variable, call `reconstruct()` before evaluating residuals. This propagates changes through the dependency chain automatically.

5. **Consumed constraints**: Skip constraints in `consumed_constraint_indices` from LM residual evaluation.

6. **`solve_single_system()` integration**:
```rust
run_presolve(...);
let graph = build_reconstruction_graph(points, lines, circles, arcs, constraints);
reconstruct(&graph, points, lines);  // initial placement
// LM runs with reduced variables; reconstruct() called in linearize() FD
```

**Testing**:
- All 74 constraint tests pass
- Spectrogram renders correctly (same SVG as baseline)
- Challenge files converge
- Verify LM variable count drops for fully-constrained sketches

### Phase 3: Subsume SketchGroup into reconstruction graph

**Files**: `solver/src/solver/reconstruction.rs`, `solver/src/solver/lm.rs`

Add `GroupFrame` as a reconstruction step type:
```rust
GroupFrame { group_idx: usize, local_points: Vec<(usize, f64, f64)> },  // (point_idx, lx, ly)
```

This means `resolve_group_points()` is replaced by a step in the reconstruction graph. The group's (x, y, θ) remain as LM variables, and the reconstruction computes owned point positions — exactly as today, but through a unified mechanism.

**Benefits**: Single code path for all derived point computation. The reconstruction graph's dependency ordering handles cases where a group-owned point is also constrained to a constructively-determined point.

### Phase 4: 1-DOF parameterization (future)

Add reduced-DOF variables for partially-determined points:
- Point on circle → 1 variable (angle θ), reconstruct x = cx + r·cos(θ), y = cy + r·sin(θ)
- Point on line → 1 variable (parameter t), reconstruct from line endpoints
- Fixed-x point → 1 variable (y only)
- Fixed-y point → 1 variable (x only)

This requires extending `Variable` and the get/set machinery. Deferred to a follow-up since Phase 2 already provides the major win.

### Phase 5: Incremental re-solve foundation (future)

The reconstruction graph's dependency DAG enables:
- Given a changed parameter (e.g., length value), trace which reconstruction steps are affected
- Only re-solve the subgraph downstream of the change
- Points upstream are cached

## Progress Tracker

| # | Change | Suite (74) | Time | Spectrogram | Status |
|---|--------|-----------|------|-------------|--------|
| — | Baseline (pre-hardening, 707dcc2) | 74/74 | 12.6s | correct (7 surfaces), err=0.000608 | ✅ |
| E1 | Wire dead-code analytical patterns (fixed=true) | 74/74 | — | BROKEN (37 surfaces), err=325 | ❌ reverted |
| E2 | LM hardening (8c16b75): central-diff FD + Nielsen + nullspace | 74/74 | — | BROKEN, err=325, 0 convergence | ❌ regression |
| E3 | Revert Nielsen → inner retry loop (keep central-diff + nullspace) | 74/74 | 11.6s | correct (7 surfaces), err=0.000434 | ✅ |
| P1+P2 | Reconstruction graph + variable elimination (aee8ccf) | 74/74 | 11.6s | correct (7 surfaces), err=0.000434 | ✅ |
| P3 | Subsume SketchGroup | | | | |

## Experiment Log

### E1: Wire dead-code analytical patterns (FAILED)

**What**: Enabled the 4 disabled patterns in `analytical.rs` — `try_circle_circle_intersection`, `try_line_circle_intersection`, `try_hdistance_plus_distance`, `try_vdistance_plus_distance`. These mark constructively-solved points as `fixed = true`.

**Result**: Spectrometer broke — 37 surfaces instead of 7, err=325. Equilateral triangle vertices placed at wrong circle-circle intersections because `pick_closest` uses garbage initial positions `(1,1)`, `(0,5)`.

**Why it failed**: `fixed = true` prevents LM from correcting wrong branch choices. Initial positions are unreliable placeholders, so proximity-based branch selection is meaningless.

**Lesson**: Never mark constructively-solved points as fixed. Use variable elimination (remove from LM) with reconstruction during FD, so LM can still influence results through remaining constraints.

### E2: LM hardening regression (FAILED — spectrometer)

**What**: Commit `8c16b75` introduced three changes: (1) central-difference FD for more accurate Jacobians, (2) Nielsen lambda update — single trial per outer iteration instead of inner retry loop with up to 12 lambda trials, (3) null-space restarts for smarter exploration.

**Result**: 74/74 tests pass, but spectrometer fails with err=325. Solver appears to make 0 progress.

**Root cause**: The **Nielsen single-trial update** is the culprit. By removing the inner retry loop (which tried up to 12 different lambda values per outer iteration), the solver can't find an acceptable step quickly enough. After 12 consecutive rejections, `run_lm_pass` bails out entirely. The spectrometer's high-dimensional, poorly-conditioned constraint system needs the inner retry loop to explore the damping landscape before giving up.

**Fix**: Restored the inner retry loop (up to 12 lambda trials per outer iteration) while keeping central-difference FD and null-space restarts.

**Lesson**: Nielsen's single-trial-per-iteration strategy works well for well-conditioned problems (all 74 unit tests pass) but fails on large, ill-conditioned systems where the initial lambda guess is far from optimal. The inner retry loop is essential for robustness.

### P1+P2: Reconstruction graph + variable elimination (SUCCESS)

**What**: Added `reconstruction.rs` with dependency DAG. Points determined by closed-form geometry (coincident, offset, circle-circle, line-circle, hDist+circle, vDist+circle) are removed from LM's variable list. Positions recomputed during each FD perturbation. Branch selection uses remaining-constraint evaluation instead of proximity.

**Result**: 74/74 tests pass, spectrometer correct (7 surfaces, err=0.000434). Same convergence quality as baseline.

**Note**: Performance impact not yet measured — the reconstruction graph currently has no effect on the spectrometer because no patterns match yet (no fixed anchor points in the spectrometer's constraint graph). The real test will come when Phase 3 (SketchGroup subsumption) is implemented, or when more patterns are added.

## Files Modified

| File | Purpose |
|------|---------|
| `solver/src/solver/reconstruction.rs` | New — graph data structure, analysis, execution |
| `solver/src/solver/lm.rs` | Variable construction, FD integration, consumed constraints, fixed Nielsen regression |
| `solver/src/solver/mod.rs` | Wire reconstruction into solve pipeline |
| `solver/src/solver/analytical.rs` | Subsumed by reconstruction (eventually removed) |

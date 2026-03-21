# Stateful Solver Session — Incremental Constraint Solving

**Prior work**: [Seeding Overhead Investigation](../seeding-overhead/PLAN.md) — established that WASM boundary overhead is negligible (0.2%), the bottleneck is redundant Rust solver computation across 54-202 stateless WASM calls.

## Goal & Current State

**Problem**: Each `constrain()` call triggers a full solver rebuild: deserialize → build_variables → build_sparsity → linearize (full Jacobian via FD) → LM solve → serialize. All internal state is destroyed after each call. The Jacobian from step 53 is 98% identical to step 54, but we recompute it from scratch.

**Baseline** (from seeding overhead investigation):

| Model | Seed calls | Total time | Per-call avg | Boundary overhead |
|-------|-----------|-----------|-------------|------------------|
| Spectrometer | 54 | 3076ms | ~46ms | 6ms (0.2%) |
| 16-rect case_wood | 202 | 5440ms | ~23ms | ~10ms (0.2%) |

**What production CAD solvers do differently** (SolveSpace, Fusion 360):
1. Maintain persistent solver state between edits
2. Mark "dirty" subsystems for selective regeneration
3. Use current parameter values as warm start (preserved in memory, not re-serialized)
4. Incrementally update the Jacobian rather than recomputing from scratch

**Target**: Spectrometer seeding from 3076ms to **< 500ms** (6× improvement). 16-rect already solved via skip-seeding (1375ms), but stateful session would further improve complex models.

## Architecture Summary

### Current Architecture (Stateless)
```
For each constrain() call:
  TS: buildDefinition()          → deep copy all entities
  TS: serializeProblem()         → map to Rust wire format
  TS: JSON.stringify()           → ~0.1ms
  WASM: serde_json::from_str()  → parse JSON into Problem struct
  WASM: expand_groups()          → compute world coords from groups
  WASM: build_variables()        → allocate Variable vec, PtVarIdx, etc.
  WASM: build_sparsity()         → build SparsityMap (var→constraint rows)
  WASM: linearize()              → compute FULL Jacobian (FD loop)
  WASM: lm_step()                → solve normal equations
  WASM: serde_json::to_string()  → serialize result
  TS: JSON.parse()               → ~0.1ms
  TS: applyResult()              → copy positions back
  TS: syncFromDefinition()       → update builder state
  [ALL SOLVER STATE DESTROYED]
```

### Proposed Architecture (Stateful Session)
```
session_create():
  Allocate SolverSession in WASM linear memory
  Return opaque session handle (u32 index)

session_add_point(handle, id, x, y, fixed):
  Push to session.points
  Extend variable mapping (O(1) append)

session_add_constraint(handle, constraint_json):
  Parse single constraint
  Extend sparsity map (add new rows, O(k) where k = variables touched)
  Run targeted presolve for this constraint
  Optionally: mini-LM solve on affected subgraph only
    - Reuse Jacobian from previous step (Broyden rank-1 update)
    - Only recompute FD for NEW constraint rows
    - Warm start from current variable values (already in memory)

session_solve(handle, options_json) -> result_json:
  Full LM solve with complete constraint set
  Return solved positions as JSON

session_destroy(handle):
  Free session memory
```

### Key Data Structures to Persist

From analysis of `solver/src/solver/lm.rs`:

```rust
struct SolverSession {
    // ── Entities (owned, mutable) ───────────────────────────
    points: Vec<Point>,
    lines: Vec<Line>,
    circles: Vec<Circle>,
    arcs: Vec<Arc>,
    shapes: Vec<Shape>,
    groups: Vec<SketchGroup>,
    constraints: Vec<Constraint>,

    // ── Variable mapping (incremental extend) ───────────────
    vars: Vec<Variable>,            // flat variable vector
    pt_var_idx: Vec<PtVarIdx>,      // per-point → (x_col, y_col)
    circ_var_idx: Vec<usize>,       // circle → radius_col
    arc_var_idx: Vec<usize>,        // arc → radius_col
    group_var_idx: Vec<usize>,      // group → frame_col_start
    entity_to_vars: HashMap<String, Vec<usize>>,  // for sparsity lookups

    // ── Sparsity (incremental extend) ───────────────────────
    sparsity: SparsityMap,          // var_to_constraint_rows, row_to_constraint
    n_rows: usize,
    n_vars: usize,

    // ── Jacobian cache (Broyden updates) ────────────────────
    jacobian: Option<Vec<Vec<f64>>>,    // n_rows × n_vars, persists between steps
    residual: Option<Vec<f64>>,         // n_rows, from last evaluation
    lambda: f64,                        // LM damping factor, warm across steps

    // ── Presolve state ──────────────────────────────────────
    entity_ref_count: HashMap<String, usize>,
    ref_scale: f64,
    coord_reduction: Option<CoordReduction>,
}
```

## Per-Step Cost Analysis

### What Each Phase Costs Today (per seed call, spectrometer avg)

| Phase | Cost | Can be incremental? | Incremental cost |
|-------|------|--------------------|--------------------|
| JSON deserialize | ~0.5ms | Eliminated (state in memory) | 0ms |
| expand_groups | ~0.1ms | Only on group changes | ~0ms |
| build_variables | ~0.5ms | O(1) append for new point/constraint | ~0.01ms |
| build_sparsity | ~1ms | O(k) extend for k new variable refs | ~0.1ms |
| coord_reduction | ~0.5ms | Recompute (structural change) | ~0.5ms |
| presolve (single) | ~1ms | Same (already per-constraint) | ~1ms |
| linearize (Jacobian) | **~30ms** | **Broyden update: O(n_vars)** | **~0.5ms** |
| LM solve | ~10ms | Warm λ, smaller affected subgraph | ~3ms |
| JSON serialize | ~0.5ms | Eliminated (state in memory) | 0ms |
| **Total** | **~44ms** | | **~5ms** |

**Expected improvement**: 44ms → 5ms per step = **~9× per step**. Over 54 steps: 2376ms → 270ms.

### The Big Win: Incremental Jacobian via Broyden Updates

The Jacobian (`n_rows × n_vars` dense matrix) is the most expensive part:
- Current: full finite-difference computation each step (~30ms)
- With Broyden: rank-1 update from previous Jacobian (~0.5ms)

**Broyden's rank-1 update formula**:
```
J_{k+1} = J_k + (y_k - J_k · s_k) · s_k^T / ||s_k||²

where:
  s_k = x_{k+1} - x_k        (step taken in variable space)
  y_k = r(x_{k+1}) - r(x_k)  (change in residuals)
```

This satisfies the secant equation `J_{k+1} · s_k = y_k` and changes J by a rank-1 matrix. The update is O(n_rows × n_vars) — just matrix arithmetic, no constraint evaluations.

**When to fall back to full FD**:
- When a new constraint is added (new rows in J — compute those rows only)
- When Broyden step fails to reduce error (J approximation has drifted too far)
- Every K steps as a periodic refresh (K=5-10)

**For new constraints**: Only the new rows need FD computation. Existing rows use Broyden update. If a constraint adds 2 rows and touches 4 variables, that's 8 FD evaluations instead of `2 × n_vars` (~120).

### Subgraph-Isolated Re-Solve

When adding a constraint that touches only a subset of variables, we can:
1. Identify the connected component in the constraint graph
2. Extract the subgraph's variables and constraints
3. Solve only that subsystem (smaller Jacobian, fewer iterations)
4. Freeze all other variables

This is what SolveSpace calls "dirty group" regeneration. For a new Length constraint on a line with 2 points (4 variables), we solve a 4-variable system instead of the full 60-variable system.

## Implementation Plan

### Phase 1: Session Lifecycle + Entity Management
**Goal**: Persistent WASM state, eliminate JSON round-trips during construction.

```rust
// lib.rs — new WASM exports
#[wasm_bindgen]
pub fn session_create() -> u32 { ... }

#[wasm_bindgen]
pub fn session_add_point(handle: u32, id: &str, x: f64, y: f64, fixed: bool) { ... }

#[wasm_bindgen]
pub fn session_add_line(handle: u32, id: &str, p0: &str, p1: &str) { ... }

#[wasm_bindgen]
pub fn session_add_constraint(handle: u32, constraint_json: &str) { ... }

#[wasm_bindgen]
pub fn session_solve(handle: u32, options_json: &str) -> String { ... }

#[wasm_bindgen]
pub fn session_destroy(handle: u32) { ... }
```

**TS builder changes**: Replace `seedIncrementalGeometry()` → call `session_add_constraint()`. Replace `buildDefinition() + solveConstraints()` in `solve()` → call `session_solve()`.

**Expected**: Eliminates JSON serialize/deserialize per step. Modest gain (~2ms per step × 54 = ~108ms).

### Phase 2: Incremental Variable + Sparsity Extension
**Goal**: Don't rebuild `build_variables` and `build_sparsity` from scratch.

When `session_add_point` is called:
- Append to `vars`, `pt_var_idx` (O(1))
- Increment `n_vars`

When `session_add_constraint` is called:
- Compute new constraint's row count and row_start
- For each variable the constraint references, append to `var_to_constraint_rows`
- Update `row_to_constraint` and `constraint_row_layout`
- Increment `n_rows`

**Expected**: Eliminates ~1.5ms per step = ~81ms total.

### Phase 3: Broyden Jacobian Updates
**Goal**: Reuse Jacobian between steps, update via rank-1 formula.

After each mini-solve step:
1. Store the solved Jacobian in `session.jacobian`
2. When next constraint is added:
   a. Extend Jacobian matrix: add new rows (FD for those rows only)
   b. For existing rows: apply Broyden update using (x_new - x_old, r_new - r_old)
3. If Broyden step fails (error increases), fall back to full FD for affected columns

**Implementation in `linearize()`**:
```rust
fn linearize_incremental(
    session: &SolverSession,
    new_constraint_indices: &[usize],  // which constraints are new
) -> LinearizedSystem {
    let mut J = session.jacobian.clone().unwrap();

    // 1. Extend J with new rows (FD for new constraints only)
    for &ci in new_constraint_indices {
        let (row_start, row_count) = session.sparsity.constraint_row_layout[ci];
        // FD only for new rows × affected variables
        for col in affected_vars(ci) {
            // central difference for J[row_start..row_start+row_count][col]
        }
    }

    // 2. Broyden update for existing rows
    let s = x_current - x_previous;  // step vector
    let y = r_current - r_previous;  // residual change
    let s_norm_sq = s.dot(&s);
    if s_norm_sq > 1e-30 {
        let correction = (y - J * s) / s_norm_sq;
        // J += correction * s^T  (rank-1 outer product)
        for row in 0..existing_rows {
            for col in 0..n_vars {
                J[row][col] += correction[row] * s[col];
            }
        }
    }

    // 3. Evaluate current residuals (always needed)
    let residual = evaluate_all_constraints(...);

    LinearizedSystem { residual, weighted_jacobian: J, ... }
}
```

**Expected**: Reduces per-step linearize from ~30ms to ~0.5ms (for Broyden update) + ~1ms (for new constraint FD rows). Over 54 steps: ~1620ms → ~81ms.

### Phase 4: Subgraph-Isolated Mini-Solves
**Goal**: When adding a constraint, only solve the affected connected component.

1. Maintain a union-find over variables (updated when constraints are added)
2. When `session_add_constraint` is called, find the connected component
3. Extract the subgraph: subset of variables + constraints touching those variables
4. Run mini-LM on the subgraph only (4-10 variables instead of 60)
5. Copy solved positions back to session state

**Expected**: Reduces per-step LM from ~10ms to ~1-2ms (smaller system).

## Risk Analysis

### Risk 1: Broyden Accuracy Drift
**Problem**: Rank-1 updates accumulate error. After many updates, J may not approximate the true Jacobian well enough for LM convergence.
**Mitigation**: Periodic full FD refresh (every 5-10 steps). Fall back to full FD when Broyden step fails to reduce error. Monitor `ρ = actual_reduction / predicted_reduction` — if ρ < 0.1, refresh J.

### Risk 2: Non-Smooth Constraints (Ccw, BlockRotation)
**Problem**: Broyden assumes smoothness. Ccw has a discontinuous derivative at area=0.
**Mitigation**: Always use FD for rows belonging to non-smooth constraints. Broyden only for smooth constraints (Length, Horizontal, Vertical, Coincident, etc.).

### Risk 3: WASM Memory Management
**Problem**: Sessions persist in WASM linear memory. Memory leaks if sessions aren't destroyed.
**Mitigation**: Session pool with maximum count. Auto-destroy oldest session when pool is full. TS builder calls `session_destroy` in finalizer/dispose.

### Risk 4: API Surface Complexity
**Problem**: Many new WASM exports (add_point, add_line, add_circle, add_arc, add_shape, add_group, add_constraint, solve, destroy). Each entity type needs its own function.
**Mitigation**: Phase 1 can use a simpler API: `session_add_entities(json)` for bulk entity setup, `session_add_constraint(json)` for incremental constraints. Only split entity types if profiling shows JSON parse overhead matters.

### Risk 5: Compatibility with Existing Paths
**Problem**: Browser interactive path and CLI batch path use different call patterns. Need to support both stateful (session) and stateless (JSON round-trip) modes.
**Mitigation**: Keep existing `solve()` WASM export unchanged. Session API is additive — old code still works. Builder chooses session path when available, falls back to stateless.

## Success Metrics

1. **Per-step cost**: < 5ms average (currently ~44ms) — 9× improvement
2. **Spectrometer total**: < 500ms seeding (currently ~2400ms) — 5× improvement
3. **No regression**: All 62 Rust tests pass, spectrometer err < 0.001
4. **Memory**: Session memory < 1MB for spectrometer-sized problems
5. **API simplicity**: ≤ 6 new WASM exports

**Revert criterion**: If per-step cost doesn't drop below 15ms, the complexity isn't justified.

## Phased Delivery

| Phase | Change | Per-step saving | Cumulative (54 steps) | Complexity |
|-------|--------|----------------|----------------------|------------|
| P1 | Session lifecycle | ~2ms | ~108ms saved | Low |
| P2 | Incremental vars+sparsity | ~1.5ms | ~189ms saved | Medium |
| P3 | Broyden Jacobian | ~28ms | ~1620ms saved | High |
| P4 | Subgraph isolation | ~8ms | ~2052ms saved | Medium |
| **All** | | **~40ms** | **~2160ms saved** | |

Expected total: 3076ms → **~900ms** for spectrometer (3.4× faster).

With subgraph isolation (P4): potentially **~400ms** (7.7× faster).

## Progress Tracker

| # | Change | Per-step | case_wood total | err | Status |
|---|--------|---------|----------------|-----|--------|
| — | Baseline (stateless) | ~37ms | 6.34s | 0.000002 | ✅ |
| P1 | Session lifecycle + TS wiring | ~37ms | 6.31s | 0.000002 | ✅ ~0% (expected — boundary was 0.2%) |
| P2 | Incremental vars+sparsity | — | — | — | pending |
| P3 | Broyden Jacobian | — | — | — | pending |
| P4 | Subgraph isolation | — | — | — | pending |

### P1 Results (2026-03-21)

- Rust session infrastructure complete: `session.rs` with SolverSession, JacobianCache, session pool
- 11 WASM exports: session_create/destroy, add_point/line/circle/arc/shape/group/constraint, solve, get_points
- TS builder wired: entity creation mirrors to session, seedIncrementalGeometry uses session_add_constraint
- No measurable speedup (expected) — serialization overhead was only 0.2% of total time
- But: eliminates per-call timeout warnings, provides foundation for P2+P3
- Check suite: 72/74 pass (same 2 pre-existing snapshot mismatches)
- **Important**: Use `node dist-cli/forgecad.js` (local build), NOT global `forgecad` for benchmarking

## Literature References

1. **Broyden (1965)** "A class of methods for solving nonlinear simultaneous equations" — original rank-1 update formula
2. **Transtrum & Sethna (2012)** "[Improvements to the Levenberg-Marquardt algorithm](https://arxiv.org/pdf/1201.5885)" — Broyden updates in LM context, geodesic acceleration
3. **Li & Fukushima (2024)** "[A Levenberg–Marquardt type algorithm with Broyden-like update](https://www.sciencedirect.com/science/article/abs/pii/S0377042724006496)" — combined LM+Broyden with convergence proof
4. **Freeman-Benson et al. (1990)** "An incremental constraint solver" (DeltaBlue) — local propagation for incremental satisfaction
5. **[SolveSpace Technology](https://solvespace.com/tech.pl)** — production CAD solver using modified Newton with warm start from previous solution
6. **[SolveSpace Architecture](https://deepwiki.com/solvespace/solvespace)** — dirty-group selective regeneration, constraint-to-equation mapping
7. **Zou et al. (2022)** "Review of Geometric Constraint Solving" — Section 5: graph-based decomposition, constructive vs numerical
8. **[Broyden's Method](https://en.wikipedia.org/wiki/Broyden's_method)** — formula, Sherman-Morrison implementation, convergence properties
9. **[NEOS Guide: Broyden](https://neos-guide.org/guide/algorithms/broyden/)** — practical implementation: initialize with FD, fall back on failure, periodic refresh

## Files to Modify

| File | Change |
|------|--------|
| `solver/src/lib.rs` | New WASM exports: session_create/add_*/solve/destroy |
| `solver/src/solver/session.rs` | NEW: SolverSession struct, incremental methods |
| `solver/src/solver/lm.rs` | Extract SparsityMap/Variable to pub, add linearize_incremental |
| `solver/src/solver/mod.rs` | Session-aware solve path |
| `src/forge/sketch/constraints/builder.ts` | Use session API instead of per-call solve |
| `src/forge/sketch/constraints/solver-wasm.ts` | Session WASM bindings |

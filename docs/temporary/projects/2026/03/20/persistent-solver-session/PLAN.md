# Persistent Solver Session — Eliminate Serialization Overhead

## Goal & Current State

**Original hypothesis**: 55 full JSON round-trips per spectrometer build (~326ms each) → ~18s serialization overhead. Replace with stateful WASM API.

**Reality (after profiling)**: JSON serialize+parse is only **5ms** (0.02%) of 22.7s total. The Rust solver computation itself is 99.98% of the time. The bottleneck is the **finite difference (FD) Jacobian loop**.

**Current baseline** (with Coincident analytics + FD skip optimization):
- Total: **15,999ms** for spectrometer (55 progressive solve steps)
- Final solve: ~5,000ms (60 vars × 71 rows, 54 constraints, 31 points)
- FD loop: **4,624ms** — 94% of linearize time
- FD columns: 80,610 ran, 13,770 skipped (out of ~94,380 total)
- Per-column cost: **~57μs** — suspiciously high

**After O(1) lookup optimizations (P5+P6)**:
- Total: **~400ms** for spectrometer (53 solve calls)
- Final solve: 22.8ms progressive (38 steps)
- FD loop: **2.5ms** (59 linearize calls)
- Linearize total: 6.5ms
- err=0.000016 (excellent convergence)

**Result**: **40× faster** than profiled baseline. Original target (<5s) exceeded by 12×.

**Target**: ~~Spectrometer from ~16s to <5s (3× improvement).~~ ACHIEVED: 400ms.

## Architecture Summary

### Solver Pipeline
```
JSON input → deserialize → expand_groups → presolve → analytical_presolve
  → build_variables → build_sparsity → GS warmstart → LM solver → serialize output
```

### LM Solver Inner Loop
```
For each outer iteration:
  linearize():
    1. Evaluate base residual (all constraints)
    2. Analytic Jacobian pass (constraints with known derivatives)
    3. FD Jacobian pass (central differences for remaining columns):
       For each variable column (60 vars):
         - get_var(col)              ← LINEAR SCAN through all entities
         - set_var(col, val + h)     ← LINEAR SCAN
         - eval affected constraints ← constraint_index_at_row: LINEAR SCAN + RESIDUAL EVAL
         - set_var(col, val - h)     ← LINEAR SCAN
         - eval affected constraints (again)
         - set_var(col, val)         ← LINEAR SCAN (restore)
  lm_step(): solve normal equations
  accept/reject step
```

### Progressive Solve
54 steps, each adding a constraint and running a short LM solve. Total ~1571 linearize calls across all steps.

## Progress Tracker

| # | Change | Total Time | Final Solve FD | err | Status |
|---|--------|-----------|---------------|-----|--------|
| — | Baseline (no profiler) | ~22,700ms | — | 0.0001 | ✅ |
| P1 | Add Rust profiler | ~16,000ms* | 4,624ms | 0.000820 | ✅ profiler itself may skew |
| P2 | Coincident analytic J | — | — | — | ✅ no FD impact (few coincident) |
| P3 | Ccw analytic J | — | — | err=1520 | ❌ broke convergence |
| P4 | FD column skip (all-analytic cols) | ~16,000ms | 4,624ms | 0.000820 | ✅ skips 13,770/94,380 cols |
| P5 | O(1) get/set_var + row→CI cache | 5,709ms | 540ms | 0.000016 | ✅ FD 8.6× faster |
| P6 | Precomputed row layout in SparsityMap | **400ms** | **2.5ms** | 0.000016 | ✅ **40× total** |
| P7 | (evaluate) Forward differences | — | — | — | 🤔 May not be needed |

*Note: 22.7s→16s drop may be unrelated to profiler; needs investigation.

## Experiment Log

### Experiment 0: Deep Profiling (SUCCESS)
**What**: Added `profiler.rs` with thread-local timing accumulators, platform-abstracted timer (performance.now() for WASM, Instant for native), and instrumented all solver phases.
**Result**: Revealed FD loop is 94% of linearize time (4,624ms of ~5,000ms). JSON serialization is only 5ms.
**Why it worked**: First-principles measurement instead of guessing.
**Lesson**: The original hypothesis (serialization overhead) was completely wrong. Always profile before optimizing.

### Experiment 1: Coincident Analytic Jacobian (SUCCESS — minor impact)
**What**: Added analytic Jacobian for `Coincident` constraint: `residual = [bx-ax, by-ay]`, partials are ±1.
**Result**: Correct convergence, but minimal FD speedup — few Coincident constraints in spectrometer, and shared points with Ccw constraints still force those columns through FD.
**Lesson**: Analytic Jacobians only help if the constraint type is the *last* non-analytic type touching a variable column.

### Experiment 2: Ccw Analytic Jacobian (FAILED)
**What**: Derived and implemented analytic Jacobian for `Ccw` (counter-clockwise ordering) constraint.
**Result**: err=1520 (divergence) vs err=0.000820 baseline.
**Why it failed**: Ccw is a non-smooth barrier function with a kink at area=0. The analytic derivative has a discontinuity that causes LM to oscillate across the boundary. FD's central differences naturally smooth this boundary (~step width), acting as implicit regularization.
**Lesson**: Non-smooth constraints should stay on FD. The "smoothing" from finite differences is actually a feature, not a bug.

### Experiment 3: FD Column Skip Optimization (SUCCESS — partial)
**What**: Skip entire FD column when all constraint rows for that variable have analytic Jacobians and no arc rows.
**Result**: Skips 13,770 columns (15%), but 80,610 still run because Ccw constraints touch many shared point variables.
**Lesson**: The skip optimization's ceiling is limited by Ccw's variable footprint. Need to make each FD column cheaper rather than skip more.

### Experiment 4: O(1) Variable Lookups + Row→Constraint Cache (SUCCESS — P5)
**What**: Two changes:
1. Built `col_to_entity: Vec<(u8, usize)>` mapping column index to (entity_kind, entity_index) for O(1) `get_var_fast`/`set_var_fast` — replaces linear scans through all entity arrays.
2. Built `row_to_constraint: HashMap<usize, usize>` mapping `row_start` to constraint index — replaces `constraint_index_at_row()` which evaluated residuals of all preceding constraints.

**Result**: FD loop 540ms (was 4,624ms) = 8.6× faster. Total 5,709ms (was ~16,000ms).
**Why it worked**: `constraint_index_at_row` was the biggest offender — it called `constraint_residual_impl` for every constraint up to the target, effectively re-evaluating residuals O(n²) times. The HashMap lookup is O(1).
**Lesson**: Always check if index→data mappings already exist before writing scan-based lookups.

### Experiment 5: Precomputed Row Layout in SparsityMap (SUCCESS — P6)
**What**: Moved `constraint_row_layout` and `row_to_constraint` into `SparsityMap` (computed once in `build_sparsity`). The analytic J pass previously called `constraint_residual_impl` for EVERY constraint on EVERY linearize call just to get `row_count`. With 11,740 linearize calls × 38 constraints = 446,120 redundant residual evaluations eliminated.

**Result**: Total **400ms** (was 5,709ms) = 14× faster. FD loop 2.5ms. Linearize total 6.5ms over 59 calls.
**Why it worked**: The row layout (which constraint maps to which rows) is structural — it doesn't change between linearize calls. Computing it once and reusing eliminated the dominant cost.
**Lesson**: Distinguish structural computation (depends on constraint graph) from numerical computation (depends on variable values). Only the latter needs to be repeated each iteration.

**Combined P5+P6 result**: 400ms total, down from ~16,000ms. **40× speedup.** The spectrometer now converges with err=0.000016 in 59 linearize calls and 15 accepted LM steps.

## Root Cause Analysis: Why 57μs Per FD Column

Three performance bugs found in the FD inner loop:

### Bug 1: `constraint_index_at_row()` — O(n) scan with residual evaluations
**Location**: `lm.rs:908-930`
**Problem**: Called 2× per affected constraint per FD column. Scans through ALL constraints, *evaluating their residuals* (`constraint_residual_impl`), just to map `row_start` → constraint index.
**Fix**: Build a `row_start → constraint_index` lookup (Vec or HashMap) once before the FD loop. The `constraint_rows` vec in `build_sparsity` already has this data — just pass it through or build the reverse map.
**Impact estimate**: Eliminates ~161,220 redundant residual evaluations per linearize call (80,610 cols × ~2 constraints × ~1 call each, with half the constraints scanned on average).

### Bug 2: `get_var()`/`set_var()` — O(n) linear scans
**Location**: `lm.rs:932-996`
**Problem**: Called 4× per FD column. Each call scans through all points (31), circles, arcs, and groups sequentially until it finds the matching variable column index.
**Fix**: Build a reverse lookup `col → (EntityType, entity_index, field_offset)` once from the `*_var_idx` arrays. Then O(1) direct access.
**Impact estimate**: Eliminates ~322,440 linear scans per linearize call.

### Bug 3: Central differences evaluate residuals 2× per column
**Problem**: Forward differences `(f(x+h) - f(x)) / h` would halve residual evaluations since the base residual `f(x)` is already computed at the start of `linearize()`.
**Trade-off**: Central differences are more accurate (O(h²) vs O(h)), which matters for LM convergence. Need to test if forward differences maintain convergence quality.
**Impact estimate**: If convergence holds, halves residual evaluation count.

## Findings: Ccw Constraint and Non-Smooth Barriers

The `Ccw` (counter-clockwise) constraint is a **signed-area barrier function**:
- `area = (bx-ax)(cy-ay) - (by-ay)(cx-ax)` for triangle ABC
- When `area > 0`: residual = 0 (satisfied)
- When `area ≤ 0`: residual = `barrier_strength * (1 - area/margin)`

The derivative is discontinuous at `area = 0`. Analytic Jacobian captures this discontinuity exactly, which makes LM oscillate across the boundary (step accepted → crosses boundary → large residual → rejected → etc). FD's central differences smooth the kink over a width of `2h`, providing implicit regularization.

**Implication**: Any optimization must preserve FD for Ccw (and potentially other barrier constraints like BlockRotation).

## Files Modified

| File | Purpose |
|------|---------|
| `solver/src/solver/profiler.rs` | NEW: profiling infrastructure |
| `solver/src/solver/mod.rs` | Profiler instrumentation of top-level phases |
| `solver/src/solver/lm.rs` | Profiler instrumentation + FD skip + diagnostics |
| `solver/src/constraints/mod.rs` | Coincident analytic Jacobian |
| `solver/src/lib.rs` | `get_last_profile()` WASM export |
| `src/forge/sketch/constraints/solver-wasm.ts` | JS-side profile access |
| `cli/test-run.ts` | Profile output in CLI |

## Next Steps

1. ~~**P5**: Build O(1) reverse lookup for `get_var`/`set_var`~~ ✅ Done
2. ~~**P6**: Cache `row_start → constraint_index` mapping~~ ✅ Done
3. **P7**: Test forward differences vs central differences (may not be needed at 2.5ms FD)
4. Test native Rust vs WASM performance (user request)
5. Measure profiler overhead (user request)
6. **Persistent solver session is no longer needed** — serialization was never the bottleneck, and the solver is now 400ms total
7. Fix 2 pre-existing test failures: `cold_start_full_spectrometer` and `cold_start_with_camera`
8. Clean up debug code (FD column counters in state_capture/state_apply, console.warn diagnostic)

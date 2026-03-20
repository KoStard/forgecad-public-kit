# Spectrometer 300ms → 200s Regression Analysis

## Goal

Understand why `spectrogram.forge.js` went from ~300ms (commit `b238b8bb`) to ~200s+timeout at HEAD, and fix it.

## Current State

- `spectrogram.forge.js`: ~54 constraints, ~60 variables, ~68 residual rows
- At `b238b8bb` (pure TS solver): 300ms total, correct geometry
- At HEAD before fix: ~200s, solver fails to converge
- **After fix: ~24s, err=0.000812, converges** (acceptable per user)

## Root Cause Analysis

### The Three Compounding Factors

**Factor 1: Incremental calls got heavy.**

Each `constrain()` triggers `seedIncrementalGeometry()` → full Rust solve. At `b238b8bb`, each call did forward-diff LM in pure JS (~4ms). At HEAD: central-diff LM via WASM with reconstruction graph + DAG analysis (~326ms).

**Factor 2: Central differences doubled FD cost.**

However, this turned out to be less impactful than expected — the Rust solver has **analytic Jacobians** for all 18 major constraint types. The spectrometer uses only constraint types with analytics (pointOnLine, absoluteAngle, perpendicular, length, equal, midpoint, parallel, lineDistance, pointLineDistance). The FD loop runs but does minimal work.

**Factor 3: TS builder passed bad cold-start parameters.**

`restarts: 1, maxScaledStep: 0.75` — fine for warm-start, catastrophic for cold. Fixed to `restarts: 6, maxScaledStep: 2.5, iterations: 80`.

### Key Architectural Discovery

The spectrometer is **over-constrained** (DOF=-4, 68 equations for 60 variables). The monolithic LM solver gets stuck at a **local minimum around err=3-5** and cannot converge below tolerance from a cold start.

The only way to converge is **progressive solving**: adding constraints one at a time with short LM solves, building up the solution incrementally. This avoids the local minimum because each intermediate system is small enough for LM to converge.

## What Was Tried (Experiment Log)

### Fix 1: Skip reconstruction + DAG for incremental (SUCCESS)
- **What**: When `presolve_constraint_id` is set, skip `build_reconstruction_graph()` and `decompose_to_solve_dag()` in `solve_single_system()`.
- **Result**: Reduced per-call overhead significantly.

### Fix 2: Disable prior regularization (SUCCESS)
- **What**: Set `prior_diag = 0.0` in LM — the TS solver never had this term.
- **Result**: Prevents pulling toward initial geometry, which hurts cold-start convergence.

### Fix 3: Fix solve parameters (SUCCESS)
- **What**: Change builder defaults to `iterations: 80, restarts: 6, warmStartIterations: 6, maxScaledStep: 2.5`.
- **Result**: Proper cold-start-capable settings.

### Fix 4: Add progressive_solve in Rust (SUCCESS)
- **What**: `progressive: true` in solve options triggers `progressive_solve()` in Rust, which adds constraints one-by-one with short (30-iter) LM solves, then a full final solve.
- **Result**: Combined with seedIncrementalGeometry warm geometry → err=0.000812 in ~24s.

### Experiment: GS rollback removal (FAILED)
- **What**: Removed GS rollback safety check.
- **Result**: gs-warm error went from 15.87 (rolled back) to 114.9 (unrestricted GS damaged geometry). **Reverted immediately.**

### Experiment: More GS warm-start iterations (FAILED)
- **What**: Increased from 6 to 30 GS warm-start iterations.
- **Result**: err=7.19 (vs 3.18 with 6). GS projectors actively fight each other on the over-constrained spectrometer.

### Experiment: Entity-filtered progressive sub-problems (FAILED)
- **What**: In progressive_solve, filter entities per step to only include those referenced by active constraints (to prevent unconstrained variable drift).
- **Result**: err=141-1099, 31-41s. Sub-problem cloning overhead is high and isolated LM passes don't maintain cross-constraint coupling. The approach should work in theory but the implementation diverges for unknown reasons.
- **Lesson**: The TS solver at b238b8bb solved ALL entities even during incremental calls (decomposition doesn't help when everything is one connected component). It worked because forward diff in pure JS was fast enough that 30 iterations kept geometry warm.

### Experiment: Progressive solve without seedIncrementalGeometry (FAILED)
- **What**: Disable TS-side incremental WASM calls, rely solely on Rust progressive_solve.
- **Result**: err=115.75, 56s. Without warm geometry, LM with ALL entities damages unconstrained variables.
- **Lesson**: progressive_solve needs warm initial geometry from seedIncrementalGeometry.

### Experiment: Presolve-only incremental + progressive final (FAILED)
- **What**: seedIncrementalGeometry with iterations=0 (presolve only), progressive_solve does LM.
- **Result**: err=310, 49s. Geometric presolve alone doesn't provide enough warming.

### Experiment: Reduced progressive iterations (MIXED)
- 5 iterations: err=0.000621, ~13s accumulated WASM time ✅
- 3 iterations: err=0.000980, ~14s accumulated WASM time ✅ (barely under tolerance)
- But when combined with seedIncrementalGeometry, double work makes wall time ~24-28s.

### Experiment: WASM debug vs release mode (SUCCESS)
- **What**: Build script defaulted to `--dev`. Building with `--release` gave 17× speedup.
- **Result**: 420s → 25s. **Critical discovery.**

## Final Working Configuration

| Component | Setting | Notes |
|-----------|---------|-------|
| seedIncrementalGeometry | iterations=30, restarts=1, warmStartIterations=4 | 54 WASM calls, ~326ms each |
| solve() defaults | iterations=80, restarts=6, warmStartIterations=6, maxScaledStep=2.5 | Cold-start capable |
| progressive | true (default) | Triggers progressive_solve in Rust |
| progressive_solve | 30 iters, 1 restart, 4 GS per step | Refines from warm geometry |
| WASM build | --release | **Critical** — debug is 17× slower |

**Result**: err=0.000812, ~24s wall time for the spectrometer.

## Known Remaining Issues

1. **24s is 80× slower than the TS 300ms baseline.** The speedup from "doesn't work" to "works" is valuable, but the Rust solver is fundamentally slower per LM call due to WASM serialization overhead and central diff.

2. **Double progressive work**: seedIncrementalGeometry (54 WASM calls) + progressive_solve (54 internal steps) = 108 solve cycles. Eliminating the redundancy could halve the time to ~12s, but requires progressive_solve to work without warm geometry (which it currently can't).

3. **Simple models are affected**: seedIncrementalGeometry makes every sketch pay N WASM round-trips per constraint, even trivial ones.

## Future Optimization Opportunities

- **Forward diff mode**: Switch incremental calls to forward diff — halves FD cost (though analytics reduce the impact).
- **Shared sparsity/variables across progressive steps**: Currently progressive_solve rebuilds `build_variables` + `build_sparsity` for each of 54 steps. Precomputing once and incrementally activating constraint rows could eliminate this overhead.
- **Smarter seedIncrementalGeometry**: Only run WASM calls when the system actually has residuals, or batch multiple constraints per call.
- **Block decomposition**: The `graph.rs` SCC infrastructure exists but is disabled. Enabling it for the final solve could help well-constrained systems.

## Files Modified

| File | Change |
|------|--------|
| `solver/src/solver/mod.rs` | Added `progressive_solve`, incremental fast-path, progressive dispatch |
| `solver/src/solver/lm.rs` | Disabled prior regularization, simplified best-pass selection |
| `solver/src/types.rs` | Added `progressive: Option<bool>` to SolveOptions |
| `solver/src/constraints/mod.rs` | Added `apply_projector_pass` (unused but available) |
| `src/forge/sketch/constraints/builder.ts` | Fixed solve() defaults, progressive=true |
| `src/forge/sketch/constraints/types.ts` | Added `progressive?: boolean` to SolveOptions |
| `src/forge/sketch/constraints/solver-wasm.ts` | Added progressive field to WASM serialization |

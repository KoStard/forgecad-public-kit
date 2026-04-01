# Seeding Overhead — Eliminate Per-Constraint WASM Round-Trips

## Goal & Current State

**Problem**: The `seedIncrementalGeometry()` phase accounts for **70-80% of total solve time**. Each `constrain()` call triggers a full WASM round-trip: `buildDefinition()` → `serializeProblem()` → `JSON.stringify()` → WASM `solve()` → `JSON.parse()` → `applyResult()` → `syncFromDefinition()`.

**Measurements (from profiling)**:

| Model | Seed calls | Seed time | Final solve | Total | Seed % |
|-------|-----------|-----------|-------------|-------|--------|
| Spectrometer | 54 | ~2500ms | 655ms | 3158ms | 79% |
| 16-rect case_wood 03/18 | 202 | ~4600ms | 883ms | 5600ms | 82% |

**WASM boundary overhead** (spectrometer, 55 total calls):
- **Rust/WASM computation: 3227ms** (99.8%)
- **Serialize + stringify + parse + apply: 6ms** (0.2%)
- JSON bytes: req=233KB, res=180KB

**Key insight**: The overhead is NOT JSON marshalling — it's **Rust solver computation repeated 54× with growing constraint sets**. Each seed call re-runs the full `solve()` pipeline: deserialize → expand_groups → presolve → build_variables → build_sparsity → LM → serialize. The growing constraint count makes later calls progressively more expensive.

**Target**: Total time from `constrain()` start to final `solve()` result: **< 1s** for spectrometer (currently 3.2s), **< 2s** for 16-rect (currently 5.6s).

## Architecture Summary

### Current Seeding Pipeline (per constraint)
```
TS: constrain()
  → push constraint to array
  → seedIncrementalGeometry():
      buildDefinition()           // deep-copy all entities
      solveConstraints()          // → solver-wasm.ts
        serializeProblem()        // filter group-owned, map to Rust wire format
        JSON.stringify()          // ~0.1ms
        WASM solve()              // full Rust pipeline: deser → expand → presolve →
                                  //   build_vars → build_sparsity → LM → serialize
        JSON.parse()              // ~0.1ms
        applyResult()             // copy solved positions back to definition
      syncFromDefinition()        // copy back to builder's live entities
```

This repeats N times (once per constraint): N=54 for spectrometer, N=202 for 16-rect.

### Why Seeding Exists
Without seeding, the final solve starts from the initial point positions (often all-zero or random). The solver must then find a feasible solution for all constraints simultaneously from scratch — which frequently diverges for large problems. Seeding keeps geometry "warm" by solving incrementally as constraints are added, so each solve starts near a feasible state.

### Progressive Mode (Already in Rust)
The `progressive_solve()` function in `solver/src/solver/mod.rs` already implements the same incremental strategy in Rust: add constraints one-by-one, run short LM solves. This was built for the final solve path and includes bottom-up decomposition. But the TS builder doesn't use it during construction — it calls individual WASM `solve()` for each constraint.

### Key Difference: TS Seeding Has Rollback
The TS `seedIncrementalGeometry()` has a critical safety mechanism (builder.ts:318):
```ts
if (Number.isFinite(maxError) && maxError <= DEFAULT_TOLERANCE * 100) {
  this.syncFromDefinition(working);
}
```
When a seed solve diverges (`maxError > tolerance * 100`), the result is **discarded** and point positions revert to their pre-call state. The Rust progressive path had no such guard — bad results accumulated and poisoned subsequent steps.

## Experiment Log

### Experiment E3: Skip Seeding Entirely (PARTIAL SUCCESS)
**What**: Disabled `seedIncrementalGeometry()` entirely. The Rust progressive solver in the final `solve()` call handles all warm-up.

**Results**:

| Model | Strategy | Total | err | Status |
|-------|----------|-------|-----|--------|
| Spectrometer | every (baseline) | 3076ms | 0.000812 | ✅ |
| Spectrometer | none | 8505ms | 303.85 | ❌ diverged |
| Spectrometer | none + rollback | 6986ms | 2.60 | ❌ still diverged |
| 16-rect | every (baseline) | 5440ms | 0.000052 | ✅ |
| 16-rect | none | 1375ms | 0.000084 | ✅ **3.9× faster** |

**Why spectrometer fails**: Without seeding, point positions start far from solution. The progressive solver adds constraints one-by-one but LM can't converge — it enters bad basins. The trail shows error oscillating (2→13→23→1514) instead of monotonically decreasing. Adding rollback (reject steps where err > tolerance*100) prevents catastrophic divergence but the solver still oscillates (err bounces between 2-13).

**Why 16-rect succeeds**: Bottom-up decomposition solves each rect cluster independently (4 points, simple geometry → always converges). Groups freeze internal geometry. Bridge warm-up operates on reduced variable space.

**Lesson**: Skip-seeding is viable ONLY when bottom-up decomposition can break the problem into small, independently solvable clusters. Complex single-cluster problems (spectrometer) require incremental warm-up.

### Experiment E4: Lazy Seeding (Every Kth Constraint)
**What**: Seed only every Kth constraint instead of every one.

**Results (spectrometer)**:

| K | Seed calls | Total | err | Status |
|---|-----------|-------|-----|--------|
| 1 (every) | 54 | 3076ms | 0.000812 | ✅ |
| 2 | 27 | 4655ms | 1.56 | ❌ |
| 5 | 11 | 8843ms | 76.3 | ❌ |

**Results (16-rect)**:

| K | Seed calls | Total | err | Status |
|---|-----------|-------|-----|--------|
| 1 (every) | 202 | 5440ms | 0.000052 | ✅ |
| 5 | 41 | 6034ms | 0.000083 | ✅ |
| 10 | 21 | 6342ms | 0.000083 | ✅ |
| skip all | 0 | 1375ms | 0.000084 | ✅ |

**Why lazy is WORSE for spectrometer**: Even K=2 breaks convergence. The spectrometer geometry is interdependent — each constraint affects the solution enough that skipping one seed creates a gap too large for subsequent seeds to recover from.

**Why lazy is WORSE for case_wood (K=5,10)**: Fewer but larger seed calls don't save time — each call processes a larger constraint set, making LM more expensive. The progressive warm-up overhead is O(N) regardless of batching. The only win is skipping ALL seeds (bottom-up handles it).

**Lesson**: Lazy seeding is a lose-lose. For decomposable problems, skip entirely. For complex problems, every constraint needs seeding.

### Experiment E2: Move Builder Logic to Rust (ANALYSIS)
**What**: Assessed the cost/benefit of keeping builder state in Rust to avoid WASM round-trips.

**Quantified overhead of current TS↔WASM boundary** (spectrometer, 55 calls):
- Serialize + stringify: 2ms total
- Parse + apply: 4ms total
- **Total boundary overhead: 6ms out of 3234ms = 0.18%**

**What Rust-native builder would save**:
- JSON round-trips: ~6ms → negligible
- buildDefinition deep copies: ~1ms × 54 = ~54ms
- Repeated Rust startup per call (deserialize, expand_groups): ~1ms × 54 = ~54ms
- **Total savings: ~60ms out of 3234ms = 1.8%**

**What it would NOT save**:
- Rust solver computation: 3227ms (99.8% of time)
- Progressive warm-up work (presolve, coord_reduction, LM per step)

**Verdict**: Moving builder to Rust saves **< 2% of total time**. The massive refactoring cost (new WASM API, session management, TS builder rewrite) is not justified by the performance gain. The bottleneck is the solver computation itself, not the boundary.

**Exception**: A Rust-native builder COULD help in the future if combined with:
1. Incremental sparsity updates (don't rebuild from scratch per step)
2. Broyden rank-1 Jacobian updates (reuse J from previous step)
3. Warm LM state persistence (λ, step direction, trust region)
These would reduce the per-step solver cost, where the actual time is spent.

## Root Cause Analysis

The seeding overhead is fundamentally caused by **redundant solver work**:

1. **Per-step pipeline overhead**: Each progressive step (whether TS-seeded or Rust-progressive) rebuilds the variable mapping, sparsity structure, and coord reduction from scratch. These are O(N) in constraint count and structural — they don't change between steps (only new constraints are added).

2. **Bad basin sensitivity**: The spectrometer's constraint graph creates a complex energy landscape with many local minima. Small perturbations in point positions can push LM into a bad basin. This is why skipping even one seed (lazy:2) breaks convergence — the gap between solved states is too large.

3. **No incremental structure exploitation**: The solver treats each progressive step as an independent problem. It doesn't reuse the Jacobian, sparsity pattern, or LM state from the previous step. Each step starts LM from scratch (new λ, new trust region).

## Next Steps

### High-Value: Hybrid Seeding Strategy
For multi-cluster problems (case_wood), skip seeding entirely and rely on bottom-up decomposition (already 3.9× faster). For single-cluster problems (spectrometer), keep per-constraint seeding.

**Implementation**: Check cluster count at `constrain()` time is not feasible (constraints are added one by one). Instead: add a builder option `skipSeeding: true` that the user can set for known-decomposable problems. Or: detect at `solve()` time and re-run without seeding if bottom-up is available.

### Medium-Value: Incremental Sparsity + Warm LM State
Keep the progressive structure but avoid rebuilding everything from scratch:
1. Incrementally extend `build_variables` and `build_sparsity` when a constraint is added
2. Persist LM state (λ, Jacobian) between progressive steps
3. Use Broyden rank-1 updates to approximate Jacobian instead of recomputing FD

This reduces per-step cost from ~46ms to potentially ~5ms (FD loop already takes 2.5ms).

### Low-Value: Constructive Placement
For rect-like patterns, compute exact positions without LM. This eliminates seed calls for the most common constraint patterns (H, V, Length, Ccw, BlockRotation). Complex for general constraints.

## Progress Tracker

| # | Change | Spectrometer | 16-rect | Status |
|---|--------|-------------|---------|--------|
| — | Baseline (current) | 3076ms | 5440ms | ✅ |
| E3 | Skip seeding | ❌ diverged | **1375ms (3.9×)** | ✅ partial |
| E3+ | Skip + rollback | ❌ err=2.60 | — | ❌ |
| E4 | Lazy:2 | ❌ err=1.56 | — | ❌ |
| E4 | Lazy:5 | ❌ err=76 | 6034ms | ❌ |
| E2 | Rust builder (analysis) | saves ~60ms (1.8%) | — | ❌ not worth it |

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/constraints/builder.ts` | TS builder — `constrain()`, `seedIncrementalGeometry()`, seed strategy control |
| `src/forge/sketch/constraints/solver-wasm.ts` | WASM boundary — `runWasmCall()`, `serializeProblem()` |
| `solver/src/lib.rs` | WASM entry points — `solve()`, `presolve()`, `presolve_single()` |
| `solver/src/solver/mod.rs` | Solver core — progressive rollback mechanism added |
| `solver/src/solver/lm.rs` | LM solver — `solve_global()`, `linearize()` |

# Solver Performance: Redundancy Detection & Incremental Solve Bottleneck

**Goal**: Fix the ~5s solve time for case_wood_cut.forge.js (a simple 11-rect model).

**Current state**: SOLVED — 4733ms → 300ms (15.8× faster)

## Root Causes (Two Issues)

### 1. Redundancy detection via re-solving (sketch.ts)

When `dof < 0` (overconstrained), the code iterated through every constraint, removed it, and ran a **full solve** to check if the constraint was still satisfied. For 137 constraints with DOF=-11, this meant up to 137 full solves. Each failing solve exhausted all restarts + GS escape at ~400ms.

### 2. Incremental builder solves with GS escape (builder.ts)

The builder ran `decomposeAndSolve()` after every constraint addition to maintain a solved state. With `restarts: 1, iterations: 30`, plus GS escape, each failing intermediate solve took ~400ms. With ~10 failing intermediate steps, this added ~3-4 seconds.

## Architecture (Before)

```
constraint addition
  → runSinglePresolve()
  → checkResiduals()           [fast path if OK]
  → buildDefinition() + decomposeAndSolve()  [30 iters + GS escape]
  → sync only if converged

sk.solve()
  → solveConstraintDefinition()
    → decomposeAndSolve()       [~32ms — the actual solve]
    → computeStatus()           [DOF = -11]
    → REDUNDANCY LOOP           [~4700ms — 137 × full solve]
```

## Architecture (After)

```
constraint addition
  → runSinglePresolve()
  → checkResiduals()           [fast path if OK]
  → buildDefinition() + decomposeAndSolve()  [20 iters, NO GS escape]
  → sync if improved (even partial convergence)

sk.solve()
  → solveConstraintDefinition()
    → decomposeAndSolve()       [full solve with GS escape]
    → computeStatus()           [DOF = -11]
    → findRedundantConstraints()  [Jacobian rank analysis, <1ms]
```

## Progress Tracker

| # | Change | Time | Error | Tests | Status |
|---|--------|------|-------|-------|--------|
| — | Baseline | 4733ms | 0.000556 | 55/55 | Slow |
| P1 | Jacobian redundancy + skipGsEscape + improvement sync | 300ms | 0.000293 | 55/55 | ✅ 15.8× faster |

## Experiment Log

### Baseline (CONFIRMED)

**What**: Ran case_wood_cut.forge.js with timing instrumentation.
**Result**: 4733ms total. Primary solve: ~32ms. Redundancy detection: ~4700ms.
**Key data**:
- 73 points, 64 lines, 137 constraints, 146 variables
- DOF = -11 (11 redundant constraints)
- 10+ redundancy-check solves stuck at err=42.25, taking 390-520ms each
- 13 expensive incremental solves totaling ~3069ms

### P1a: Jacobian rank analysis for redundancy (SUCCESS)

**What**: Replaced the re-solve loop with column-pivoted QR on J^T. One Jacobian evaluation + O(m·n·min(m,n)) rank analysis.
**Result**: Redundancy detection: <1ms (was ~4700ms). Correctly identifies all 11 redundant constraints (6 CCW + 5 blockRotation).
**Why it works**: A constraint is redundant iff its Jacobian row(s) are linearly dependent on the other rows at the solved state. QR with column pivoting identifies dependent columns directly.

### P1b: skipGsEscape for incremental solves (PARTIAL — needs improvement sync)

**What**: Added `skipGsEscape` option to `SolveOptions`. Builder incremental solves use it.
**Result (skipGsEscape only)**: case_wood_cut fails (err=121) because positions aren't synced on failure.
**Result (skipGsEscape + always sync)**: case_wood_cut works (342ms), spectrogram fails (err=4M).
**Result (skipGsEscape + improvement sync)**: Both work! 300ms case_wood_cut, 241ms spectrogram.
**Why**: The key was syncing whenever the solver improved on the pre-solve state, even if not fully converged. This keeps geometry moving toward the solution without the ~300ms GS escape penalty.

### Failed: skipGsEscape + conditional sync (only on convergence)

**What**: Same as old behavior but without GS escape.
**Result**: case_wood_cut: err=121. Spectrogram: err=41.
**Why it failed**: Without GS escape AND without syncing partial improvements, geometry stays in presolve state which may be far from optimal. Next constraint added makes it worse.

### Failed: skipGsEscape + always sync

**What**: Always sync solver result, even when not converged.
**Result**: case_wood_cut: 342ms ✓. Spectrogram: err=4.2M ✗.
**Why it failed**: Some intermediate states where the solver didn't converge produced positions WORSE than presolve. By always syncing, we accepted these degraded states. The spectrogram's rotated geometry was particularly sensitive.

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `types.ts` | Added `skipGsEscape` to `SolveOptions` | Allow callers to skip expensive GS escape |
| `registry.ts` | `skipGsEscape` parameter in `solveGlobalSystem` | Early return before GS escape when flag set |
| `registry.ts` | `findRedundantConstraints()` function | Jacobian rank-based redundancy detection |
| `builder.ts` | Incremental solve: skipGsEscape + improvement sync | Avoid ~300ms GS escape per failing step |
| `sketch.ts` | Replace re-solve loop with `findRedundantConstraints()` | Eliminate redundancy detection bottleneck |

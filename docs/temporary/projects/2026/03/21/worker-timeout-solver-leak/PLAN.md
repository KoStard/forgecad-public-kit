# Worker Timeout & Solver Time Budget — Prevent Hung Executions

## Goal & Current State

**Problem**: Scripts with large constraint systems hang indefinitely, blocking the single eval worker and preventing all subsequent runs. The UI "gets worse and worse" as users switch between files — the hung execution from a previous file blocks new file evaluations.

**Baseline measurements** (CLI, 2026-03-21):

| File | Time | Status |
|------|------|--------|
| spectrogram.forge.js (03/16) | ~2.5s | OK (was 400ms in previous investigation — regression?) |
| case_wood (03/20, groupRect) | ~200ms | OK |
| case_wood (03/18, sk.rect) | >52s | HUNG — dominated by seedIncrementalGeometry calls |

**03/18 vs 03/20 difference**: The 03/18 file uses `sk.rect()` + `sk.length()` constraints (full solver variables per rectangle — 8 vars each), while the 03/20 uses `sk.groupRect()` (rigid body, 3 DOF). With ~16 rectangles, the 03/18 version has 216 variables vs 96, and `seedIncrementalGeometry` calls solver ~200 times (once per `constrain()` call).

**Root causes identified**:
1. **No worker timeout** — Singleton eval worker. If one script hangs, all subsequent runs are permanently blocked.
2. **No solver time limit** — `solve_global` has iteration limits (80 iters × 6 restarts × 3 GS escape rounds) but no wall-clock bound.
3. **No progressive-solve time budget** — Progressive solve calls `solve_global` once per constraint.
4. **seedIncrementalGeometry had no budget** — Called on every `constrain()`, each call does a full WASM solve. For 200 constraints, that's 200 solver calls before the final `solve()` even starts. This was the dominant cost (~46s of the 52s total).

## Architecture Summary

```
Browser Main Thread → postMessage → Eval Worker (singleton)
                                        ↓
                                    runScript() → constrainedSketch()
                                        ↓
                                    Per constrain() call: seedIncrementalGeometry()
                                      → solveConstraintsWasm() (30 iters, 1 restart)
                                        ↓
                                    Final sk.solve():
                                      → Progressive: solve_global × N constraints
                                      → Final: solve_global (80 iters × 6 restarts)
```

If any solve call hangs, the worker thread is blocked. New run requests queue (only latest kept) but never execute.

## Progress Tracker

| # | Change | spectrogram | case_wood 03/20 | case_wood 03/18 | Status |
|---|--------|-------------|-----------------|-----------------|--------|
| — | Baseline | 2.5s | 200ms | >52s | ✅ measured |
| P1 | Solver wall-clock timeout (Rust) | 2.5s | 200ms | — | ✅ no regression |
| P2 | Progressive time budget (Rust) | 2.5s | 200ms | — | ✅ progressive exits after 6s |
| P3 | Seed time budget (TS) | 2.5s | 200ms | 12s | ✅ **4× faster** |
| P4 | Worker execution timeout (JS) | — | — | — | ✅ 30s kill+restart |

**Final result**: 03/18 case_wood goes from **>52s (hung) → 12s (returns with partial solve)**. All other files unchanged.

## Experiment Log

### P1: Solver wall-clock timeout (SUCCESS)
**What**: Added `deadline_us` parameter to `solve_global` and `run_lm_pass` in the Rust solver. Checks wall-clock time at the start of each restart attempt, GS escape round, and LM outer iteration. When exceeded, returns best result so far.
**Result**: No impact on already-working files (they finish well within budget). Prevents individual solver calls from running indefinitely.
**Why it worked**: The timeout is checked at natural iteration boundaries, so no partial-iteration corruption.
**Lesson**: Wall-clock timeout > iteration limits for user-facing guarantees.

### P2: Progressive solve time budget (SUCCESS)
**What**: Progressive warm-up phase gets 60% of the total time budget. Each progressive step gets min(500ms, remaining). When budget is exhausted, skip remaining progressive steps and proceed to final solve.
**Result**: For 03/18 case_wood with 201 constraints, progressive phase exits after ~6s instead of running all 201 steps unbounded.
**Lesson**: Progressive solve is O(n²) in constraint count — each step solves a growing system. Must have a budget.

### P3: Seed incremental geometry time budget (SUCCESS — key fix)
**What**: Added cumulative time tracking in `seedIncrementalGeometry`. Total seed budget: 5s. Per-call budget: min(500ms, remaining). When exhausted, seeding is skipped for remaining constraints.
**Result**: This was the dominant bottleneck — ~46s of the 52s total was spent in seed calls (200 separate WASM round-trips). With the 5s budget, total time drops to 12s.
**Discovery**: The `seedIncrementalGeometry` path was the real culprit, not the final `solve()` call. Each `constrain()` call triggered a full WASM solve round-trip.
**Lesson**: Per-call profiling masked the cumulative cost. Always measure end-to-end, not just per-invocation.

### P4: Worker execution timeout (SUCCESS — safety net)
**What**: `EvalWorkerClient.run()` starts a 30s watchdog timer. If the worker doesn't respond, it's terminated and a fresh one is created on the next `run()`.
**Result**: Last-resort protection. With P1-P3 in place, this should rarely trigger — but guarantees the UI never gets permanently stuck.
**Lesson**: Defense in depth — Rust timeouts prevent most hangs, but the JS watchdog catches anything unexpected (infinite loops in user code, kernel crashes, etc.).

## Files Modified

| File | Purpose |
|------|---------|
| `solver/src/types.rs` | Added `time_budget_ms` to `SolveOptions` |
| `solver/src/solver/lm.rs` | `deadline_us` param in `solve_global` + `run_lm_pass`, time checks |
| `solver/src/solver/mod.rs` | Time budget threading through `progressive_solve`, `solve_system`, `solve_single_system` |
| `src/forge/sketch/constraints/types.ts` | Added `timeBudgetMs` to TS `SolveOptions` |
| `src/forge/sketch/constraints/solver-wasm.ts` | Wire `timeBudgetMs` to Rust `time_budget_ms` |
| `src/forge/sketch/constraints/builder.ts` | Seed time budget (5s cumulative), per-solve timeout (10s default) |
| `src/workers/evalWorkerClient.ts` | 30s worker watchdog timer with kill+restart |

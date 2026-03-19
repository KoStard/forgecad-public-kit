# CCW Winding Enforcement & Wrapper Rect Stability

**Goal**: Fix the constraint solver so that adding `lineDistance(wrapper.side, inner.side, 0)` constraints (to create a bounding wrapper rectangle) does not disturb existing geometry. Adding a wrapper must be a pure addition — existing point positions must not drift.

**Current state**: SOLVED ✓ (54/54 tests pass, spectrogram converges at err=0.000006)

**Formal test**: `testWrapperRectDoesNotDisturbLayout` in `cli/check-constraints.ts` (L7)
- Builds a multi-rect case layout (2 sections × 5 rects = 10 rects, connected via midpoint+lineDistance)
- Solves without wrapper, captures all point positions
- Adds wrapper rect with 4 lineDistance=0 constraints to outermost edges
- Re-solves and asserts every original point stays within 0.1mm relative drift

**Baseline failure**: pt-133 drifted 375.65mm when wrapper was added.

---

## Root Cause Analysis

### Architecture
```
constrain() → runSinglePresolve() → checkResiduals() → incremental decomposeAndSolve()
                                                            ↓
                                                    runProjectorWarmStart() → LM iterations
```

### The actual root cause

**lineDistance.presolve() moved inner geometry instead of wrapper geometry.**

When `lineDistance(wrapper.right, rightSide.right, 0)` was presolve'd, the presolve needed to decide which line to move. The original heuristic was purely length-based: move the shorter line. But after previous wrapper constraints (top/bottom) moved the wrapper corners, `wrapper.right` spanned the full layout height (934mm), making it appear "established" — longer than `rightSide.right` (339mm).

So the presolve moved the inner `rightSide.right` line (305mm shift) instead of the wrapper line. This corruption propagated through `syncFromDefinition` and the final solve converged to the corrupted state.

### Why entityRefCount was needed

The length heuristic fails when wrapper lines get **inflated** by prior presolves — a rect's vertical sides grow taller when its corners are moved by horizontal lineDistance constraints. The inflated length gives a false signal of "established" geometry.

Entity reference counting (how many constraints reference each entity) is a better signal: wrapper lines are new and have few constraint references, while inner geometry lines are part of an established network with many references.

### The tie-breaker problem

When ref counts are equal (common case — both lines are part of rects with identical constraint structures), the fallback matters:

- `lenA < lenB` (original): Fails for inflated wrapper lines (wrapper is longer → moves inner)
- `lenA < lenB || lenA > lenB * 2` (solution): Detects inflation — if A is much longer than B (>2×), it's inflated by prior presolves, so move A. Otherwise, move the shorter line.

---

## Experiment Log

### Experiment 1: lineDistance presolve (move shorter line) + smart solve (< 0.5× threshold)
**What**: Added `presolve` that moves shorter line toward longer. Changed `solve` to move `a` when `lenA < lenB * 0.5`.
**Result**: 53/53 old tests pass. Wrapper test not yet written.
**Why insufficient**: The `0.5×` threshold in solve is too conservative.

### Experiment 2: CCW residual as min(area,0) / sqrt(-area)
**What**: Made CCW contribute a continuous residual to the Jacobian.
**Result**: Unnormalized area (~166k mm²) dominated solver.
**Lesson**: Scale matters.

### Experiment 3: 50/50 split movement in solve()
**What**: Split the distance shift evenly between both lines.
**Result**: Broke `rectWithOffset` test (maxError=28.13).

### Experiment 4: Presolve + smart solve (< 0.25× threshold)
**What**: Combined presolve with a stricter smart heuristic in solve.
**Result**: Formal wrapper test: pt-133 drifts 378.79mm.
**Root cause**: Drift happens during `constrain()` phase.

### Experiment 5: Position regularization (Tikhonov damping)
**Result**: Base case fails to converge — regularization fights initial convergence.

### Experiment 6: Adaptive regularization + post-warmstart anchoring
**Result**: Wrapper drift unchanged. Anchoring locks in corruption.

### Experiment 7: Monotonic warm-start (iteration-level)
**Result**: Didn't help wrapper (GS pass reduces total error by satisfying new constraint, masking inner drift).

### Experiment 8: entityRefCount in solve()
**What**: Used constraint reference counts in `lineDistance.solve()` for the "which line to move" decision.
**Result**: Spectrogram convergence broke (err=2.77–17.89). Wrapper drift unchanged.
**Why**: The drift was in PRESOLVE, not solve(). Changing solve() heuristic was targeting the wrong layer.

### Experiment 9: warmStartIterations=0 in constrain()
**What**: Disabled GS warm-start during incremental solves.
**Result**: All check-constraints pass but spectrogram MODEL fails (err=6.86). The spectrogram needs cross-constraint GS iterations during incremental builds.
**Lesson**: User feedback — "If the algorithm is good, why should it get hurt from running it more times?"

### Experiment 10: entityRefCount in presolve with inflation-aware tie-breaker ← THE FIX
**What**: Added `entityRefCount` to presolve context (both `runSinglePresolve` in builder.ts and `solveConstraints` in registry.ts). When ref counts are equal, use `lenA < lenB || lenA > lenB * 2` — the second condition detects lines inflated by prior presolves.
**Result**: ALL 54 tests pass. Spectrogram: err=0.000006. Wrapper: 0.0mm drift.
**Why it works**: The inflation detection (`lenA > lenB * 2`) catches the specific failure mode — wrapper lines that were stretched by top/bottom presolves appear artificially long. The presolve correctly moves the inflated wrapper line instead of the inner geometry, giving LM a good starting point.

### Experiment 11: CCW constraint investigation — can it be removed?
**What**: Temporarily made CCW a complete no-op (presolve, solve, residual all return immediately).
**Result**: 53/54 tests pass. `addPolygon CCW enforcement` fails — CW-ordered input stays CW (area=-50).
**Lesson**: CCW enforcement is load-bearing. Downstream code (`polygon()` in primitives.ts) normalizes winding for geometry output, BUT:
1. The `testAddPolygonCCW` test expects the solver to flip CW→CCW
2. CCW winding affects lineDistance sign semantics during solving
3. Removing CCW would break the contract that solver output vertices are in CCW order

### Experiment 12: Keep CCW with one-sided residual ← VALIDATED
**What**: CCW constraint uses three layers: (1) presolve reflects a vertex to flip CW→CCW, (2) solve does the same during GS warm-start, (3) residual returns `area/scale` when CW (negative), `0` when CCW.
**Result**: ALL 55 tests pass (including new multi-rect winding test). Spectrogram: err=0.000303. All 11 rects in wrapper test are CCW.
**Why it works**: presolve seeds the correct basin, solve maintains it during GS, and the one-sided residual gives LM gradient information without consuming DOF. The `equations: 0` keeps DOF arithmetic unchanged since CCW is a discrete orientation choice, not a continuous constraint.

---

## CCW Analysis

CCW enforcement **cannot be removed** — it is load-bearing:
- Manifold `CrossSection` expects CCW outer loops (CW = hole)
- Region detection uses signed area to distinguish outers from holes
- Boolean ops produce inverted geometry with CW input
- Extrude produces inside-out shapes with CW winding
- `polygon()` normalizes winding downstream, but solver tests and lineDistance semantics depend on CCW output

The current three-layer approach (presolve + solve + residual) is the correct design:
- `equations: 0` — no DOF consumed (discrete choice)
- One-sided residual — LM sees CW violations but CCW is "free" (no false constraints)
- presolve/solve — imperative correction for GS phases

### Experiment 13: Spectrogram width parameter fragility — CLI vs UI
**What**: User reported spectrogram fails at `width=93` but works at `width=94`. Investigated whether the solver is fundamentally fragile or this is an environment issue.
**Result**: CLI sweep of width=10 through 200 — ALL converge at err=0.000303. No fragility whatsoever. The solver is robust across the entire range.
**Root cause**: The failure is UI-only. Analysis of `forgeStore.ts` and `evalWorker.ts` showed the UI re-executes the script from scratch (same path as CLI) — no partial caching or warm-starting from old positions. The `runResultCache` is keyed on `(code, files, paramOverrides, quality)` and correctly invalidates on any change. Most likely cause: stale Vite dev server bundle that hadn't picked up the solver fixes (entityRefCount, CCW residual). CLI runs against source directly via `npx tsx`.
**Lesson**: When diagnosing solver fragility, always verify with CLI first to isolate solver bugs from build/caching issues. Added `disableRunCache` advanced config flag to allow disabling the UI's `runResultCache` for debugging.

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `types.ts` | `entityRefCount?: Map<string, number>` on `SolverContext` | Passes ref count info to presolve hooks |
| `registry.ts` | Build `entityRefCount` in `solveConstraints()` | Counts constraint refs for final solve context |
| `builder.ts` | Build `entityRefCount` in `runSinglePresolve()` | Counts constraint refs for incremental presolve context |
| `lineDistance.ts` | `presolve()` uses entityRefCount + inflation detection | Moves less-constrained line; detects inflated wrapper lines |
| `ccw.ts` | One-sided residual + updated docstring | Gives LM gradient info for CW violations |
| `check-constraints.ts` | L7 wrapper stability + multi-rect winding tests | Regression tests for wrapper rect stability and CCW winding |

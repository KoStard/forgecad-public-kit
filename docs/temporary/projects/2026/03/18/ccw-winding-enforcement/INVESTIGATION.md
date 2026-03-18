# CCW Winding Enforcement During lineDistance Constraints

**Goal**: Fix the constraint solver so that adding `lineDistance(wrapper.side, inner.side, 0)` constraints (to create a bounding wrapper rectangle) does not cause inner rectangles to "flip inside" — collapsing their winding order.

**Current state**: SOLVED — 53/53 tests pass, model produces 26 surfaces correctly with err=0.000635 (below tolerance 0.001).

---

## Root Cause Analysis

### The problem
When a wrapper rectangle is added with `lineDistance(wrapper.side, innerRect.side, 0)` to align edges, inner rectangles "flip inside" — their vertices rearrange and winding breaks, producing collapsed/inverted geometry.

### Architecture context
From the solver improvement plan, the key architecture is:
```
constrain() → runSinglePresolve() → checkResiduals() → incremental decomposeAndSolve()
                                                            ↓
                                                    runProjectorWarmStart() → LM iterations
```

### Why it happens (2 interacting issues)

1. **`lineDistance` has no `presolve` hook** — so `runSinglePresolve()` does nothing when `lineDistance(wrapper.left, inner.left, 0)` is added. The wrapper stays at its default 10×10 position at origin.

2. **`lineDistance.solve()` always moves line `b` when both lines are free** — During `runProjectorWarmStart()`, the `solve()` projector drags `b` (inner.left, the established geometry) toward `a` (wrapper.left, near origin), corrupting inner geometry positions.

### Key constraint: `lineDistance` solve priority
```typescript
// lineDistance.solve(), line 99:
if (allAFixed || !allBFixed) {
  // move b toward a — THIS IS THE PROBLEM
}
```
When both lines are free (`allAFixed=false`, `allBFixed=false`): `false || true = true` → always moves `b`. For `lineDistance(wrapper, inner, 0)`, this moves inner toward wrapper at origin.

---

## Solution

Two changes to `lineDistance.ts`, both addressing initialization:

### 1. Added `presolve` hook — move shorter line toward longer
When `constrain()` calls `runSinglePresolve()`, the new `presolve` compares line lengths and moves the shorter line toward the longer one. New geometry (e.g. wrapper rect at default 10×10) has short sides; established geometry has been sized by previous constraints. This places the wrapper near the inner geometry during initialization.

### 2. Smart `solve` heuristic — move shorter line when size difference is large
In `solve()`, when both lines are free and line `a` is less than half the length of `b`, move `a` instead of `b`. This prevents the warm-start projector from dragging large established geometry toward small new geometry. Falls back to the original behavior (move `b`) when lines are similar size.

These two changes together fix the initialization problem without affecting existing tests. The CCW continuous residual was tested but ultimately not needed.

---

## Experiment Log

### Experiment A: CCW continuous residual — `min(area, 0)` (FAILED)
**What**: Added one-sided penalty to CCW residual: `return [Math.min(area, 0)]`
**Result**: Model still broken — 8 surfaces, centroids at x≈11228. Solver converged to wrong local minimum.
**Why it failed**: The raw area value (~166,250 mm²) is orders of magnitude larger than other constraint residuals (~0-500 mm). Even with `computeRowWeights` normalization, the kink at `area=0` and the massive scale difference cause LM to struggle.
**Lesson**: Unnormalized area as a residual doesn't work — scale matters even with row weighting.

### Experiment B: lineDistance split-movement when both free (PARTIAL — broke test)
**What**: When both lines are free in `lineDistance.solve()`, split the shift equally between both lines.
**Result**: Wrapper model improved (26 surfaces, near-origin centroids), but `rectWithOffset` test regressed to maxError=28.13.
**Why it partially worked**: Splitting movement prevents the projector from fully dragging inner geometry to origin. But the split also breaks the common case where `b` (the newer geometry) SHOULD move toward `a` (the reference).
**Lesson**: The `both-free` case needs a smarter heuristic than 50/50 split. Most callers expect `b` to move.

### Experiment B+: CCW normalized residual — `-sqrt(-area)` (alongside split-movement)
**What**: Changed CCW residual to `area >= 0 ? 0 : -Math.sqrt(-area)` for length-scale normalization.
**Result**: Combined with split-movement, produced 26 surfaces correctly. But the split-movement broke the rectWithOffset test.
**Lesson**: sqrt normalization brings CCW residual to the right scale, but not needed if initialization is fixed.

### Experiment C: lineDistance presolve — move shorter line (SUCCESS — tests pass, model works)
**What**: Added `presolve` hook to `lineDistance` that moves the shorter line toward the longer one. This places new geometry near established geometry during initialization.
**Result**: 53/53 tests pass. Model: 26 surfaces, err=0.000635, correct geometry.
**Why it worked**: Consistent with the solver plan's key insight: "the problem is initialization, not solver power." The presolve places the wrapper near the inner geometry, giving the solver a good starting point.

### Experiment D: Smart solve heuristic — move shorter when < half length (SUCCESS)
**What**: In `lineDistance.solve()`, when both lines are free and `lenA < lenB * 0.5`, move `a` instead of `b`. Falls back to move-b otherwise.
**Result**: Same quality — 53/53 tests pass, 26 surfaces, err=0.000635.
**Why it works**: During warm-start iterations, the wrapper sides (10mm) are much shorter than inner sides (339-475mm), so the projector moves the wrapper instead of dragging inner geometry. For the rectWithOffset test, outer (20mm) and inner (14mm) lines are similar size → falls back to move-b → no regression.

### Experiment E: CCW residual without lineDistance fixes (FAILED — not sufficient alone)
**What**: Added CCW continuous residual without presolve/solve changes.
**Result**: Without presolve fix: 37 constraint residuals above 0 (all below tolerance, but worse convergence). Without any lineDistance changes: same broken behavior as baseline.
**Lesson**: CCW residual is defense-in-depth but doesn't fix the root cause (bad initialization). The lineDistance presolve + smart-solve are the essential fixes.

### Experiment F: lineDistance fixes without CCW residual (SUCCESS — CCW not needed)
**What**: Kept presolve + smart-solve, reverted CCW to discrete-only.
**Result**: 53/53 tests pass, 26 surfaces, err=0.000635. Identical to with CCW residual.
**Lesson**: The CCW continuous residual is not needed when initialization is correct. Keeping CCW as discrete-only (simpler, no DOF impact).

---

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/constraints/defs/lineDistance.ts` | Added `presolve` hook + smart `solve` heuristic |

# Constraint Solver Improvement Plan

**Goal**: Fix the constraint solver so the spectrogram model (and all similar complex models) solves with **0 rejected constraints** and produces customer-ready output.

**Current state**: ✅ SOLVED — 0 rejections, maxError=0.0001 (DOF=-4 but all constraints satisfied). All 43 tests pass.

---

## Architecture Summary

```
User code (constrainedSketch → .constrain() calls)
    ↓
ConstrainedSketchBuilder (builder.ts)
  - Single-constraint presolve: initialises new geometry in correct basin
  - Incremental solve (no rejection): syncs positions on convergence
  - Never rejects — all constraints kept
    ↓
decomposeAndSolve (decompose.ts)
  - Union-Find partitions constraints into independent subsystems
  - Solves each subsystem independently
    ↓
solveGlobalSystem (registry.ts)
  - Warm-start: GS projector iterations on attempt 0 only
  - Multi-restart LM with golden-angle perturbation seeds
  - GS escape rounds: after LM stalls, GS nudge → LM refinement (×3)
  - Levenberg-Marquardt with central-difference Jacobian, trust-region damping
    ↓
solveConstraintDefinition (sketch.ts)
  - Builds ConstraintSketch with metadata (status, DOF, edges, construction)
  - Detects conflicting/redundant constraints (from solved state)
```

---

## Key Changes (what fixed the solver)

### 1. Single-constraint presolve in constrain() (THE KEY FIX)
When a new constraint is added, its presolve hook runs directly on the builder's entities before the incremental solve. This initialises new points (which start at (0,0)) in the correct geometric neighborhood. Without this, the incremental solve starts from bad positions and either fails to converge or converges to a local minimum.

### 2. GS escape rounds after LM stalls
After all LM restarts complete, if the system hasn't converged, the solver runs 3 rounds of: GS projectors (30 iterations) → LM refinement. This hybrid approach breaks through local minima that neither pure LM nor pure GS can escape alone.

### 3. Incremental solve without rejection
`constrain()` always keeps the constraint. It test-solves the system and syncs positions only when maxError ≤ tolerance. No order-dependent rejection.

### 4. Warm-start only on attempt 0
GS projectors only run before the first LM restart. Subsequent restarts use their perturbation seeds directly, preserving multi-restart diversity.

### 5. Redundancy detection from solved state
Clones from solved positions (not original) for faster, more reliable redundancy detection.

---

## Progress Tracker

| # | Task | Status | Test Coverage | Notes |
|---|------|--------|---------------|-------|
| 1 | Test infrastructure | DONE | 43 tests | L1-L5 + snapshots |
| 2 | Constraint-aware SVG renderer | DONE | — | buildConstraintSvgDocument() |
| 3 | SVG snapshot tests | DONE | 3 snapshots | rect, equilateral, angle-30 |
| 4 | Incremental solve, no rejection | DONE | spectrogram test | 0 rejections |
| 5 | Warm-start only on attempt 0 | DONE | L1-L4 guard | Multi-restart diversity |
| 6 | Redundancy detection from solved state | DONE | snapshot guard | Performance |
| 7 | Single-constraint presolve | DONE | L4b + L5 | THE KEY FIX |
| 8 | GS escape rounds | DONE | spectrogram | Breaks local minima |
| 9 | Spectrogram convergence | DONE | L5 spectrogram | maxError=0.0001 ✅ |

---

## Experiment Log (Failed Approaches)

### Experiment A: Smooth sin-based angle residuals
**What**: Replaced `normalizeAngle(angle - target)` with `sin(angle - target)` (cross/dot product formulation) in absoluteAngle, angle, and pointOnLine residuals.
**Result**: Spectrogram maxError jumped from ~4.56 to 60.05 (absoluteAngle) and 11.03 (angle+pointOnLine).
**Why it failed**: `sin(x) = 0` has TWO zeros per period (target and target+180°). With deferred solving, presolve can't reliably pick the right basin for all constraints simultaneously.
**Lesson**: Don't replace a function with 1 zero per period with one that has 2 zeros.

### Experiment B: Pure deferred solving (no incremental solve in constrain())
**What**: Removed all solving from `constrain()`. Just accumulate constraints, solve once at `solve()`.
**Result**: maxError=11.03 with smooth residuals, ~4.56 with normalizeAngle residuals.
**Why it failed**: Without incremental solving, `solve()` starts from raw initial positions. The geometry hasn't been warmed up by progressive constraint satisfaction.
**Lesson**: Incremental solving without rejection gives the best of both worlds.

### Experiment C: Multi-pass presolve (3 passes)
**What**: Ran presolve hooks 3 times instead of once.
**Result**: maxError went from 4.56 to 5.6 (worse).
**Why it failed**: Presolve hooks fight each other across passes.
**Lesson**: Presolve is a one-shot initialization. Iterating makes it worse.

### Experiment D: 500 warm-start iterations (up from 200)
**What**: Increased GS projector warm-start iterations.
**Result**: maxError went from 2.73 to 4.56 (worse).
**Why it failed**: GS projectors oscillate and diverge after initial improvement.
**Lesson**: More iterations ≠ better. There's an optimal window.

### Experiment E: Always-sync incremental solve
**What**: In `constrain()`, always sync positions back, even when maxError > tolerance.
**Result**: maxError=42546 (catastrophic).
**Why it failed**: Syncing bad solutions corrupts geometry.
**Lesson**: Only sync when the solver actually converged.

### Experiment F: Relaxed sync threshold (maxError ≤ 1.0)
**What**: Sync positions when maxError ≤ 1.0 instead of ≤ 1e-3.
**Result**: maxError=1165 (catastrophic).
**Why it failed**: Partially-converged solutions can be in completely wrong configurations. The solver found a wrong basin and synced it.
**Lesson**: There's no safe middle ground — either sync converged or don't sync at all.

### Experiment G: All-constraint presolve sync
**What**: Run presolve for ALL constraints and sync all positions.
**Result**: maxError=236 (catastrophic).
**Why it failed**: Running all presolves moves already-converged points, breaking earlier constraints.
**Lesson**: Only run presolve for the NEWLY ADDED constraint.

### Experiment H: Retry with more iterations on failure
**What**: When 40-iteration incremental solve fails, retry with 200 iterations and 12 restarts.
**Result**: Same maxError — no improvement.
**Why it failed**: The solver hits the same local minimum regardless of iteration count.
**Lesson**: The issue is initialization, not solver power.

### Experiment I: Warm-start parameter sweep
**What**: Tested ws=6,15,30,50,80,120 × restarts=6,12,20.
**Result**: Best was ws=30 at 4.88, all others ≈5.79. Restarts made no difference.
**Why it failed**: Pure LM with different warm-start can't escape the same basin.
**Lesson**: Warm-start tuning has diminishing returns; need qualitative change.

### Experiment J: Solver parameter sweep (step size, iterations)
**What**: Tested maxScaledStep 1.0/2.5/5.0/10.0, iterations 100/200/500, various combinations.
**Result**: Best was 4.88 (same as ws=30). Step=10 was worst (14.65). Step=1.0 was slightly worse (6.29).
**Lesson**: Default step size (2.5) is near-optimal. Bigger steps overshoot; smaller steps get stuck.

### SUCCESS: Single-constraint presolve + GS escape (Experiments K+L combined)
**What**: (K) Run presolve ONLY for the newly added constraint on builder's own entities. (L) After all LM restarts, run 3 rounds of GS→LM.
**Result**: maxError=0.0001 ✅
**Why it worked**: (K) New points start in the correct neighborhood instead of (0,0). The incremental solve converges much more often, keeping geometry warm. (L) For the few remaining cases where LM stalls, GS projectors nudge the solution enough for LM to find the global minimum.
**Key insight**: The problem was initialization, not solver power. 50+ constraints, each adding points at (0,0), meant the solver had to navigate a maze of local minima. With presolve placing each new point correctly, the solver's path to the global minimum was clear.

---

## Files Modified

| File | Purpose |
|------|---------|
| `cli/check-constraints.ts` | Test suite (43 tests + snapshots) |
| `cli/check-suite.ts` | Wired up constraint checks |
| `cli/forgecad.ts` | Registered `check constraints` CLI command |
| `cli/snapshots/constraint-snapshots.json` | Baseline snapshot data |
| `cli/sketch-svg.ts` | Constraint-aware SVG rendering |
| `src/forge/sketch/constraints/builder.ts` | Single-constraint presolve + incremental solve |
| `src/forge/sketch/constraints/registry.ts` | Warm-start on attempt 0 + GS escape |
| `src/forge/sketch/constraints/sketch.ts` | Redundancy detection from solved state |

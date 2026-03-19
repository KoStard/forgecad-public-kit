# Solver Robustness: Analytical Jacobians + Smooth Residuals

## Goal & Current State

**Goal**: Make the 2D constraint solver fundamentally robust — not fragile to slight input changes, initial positions, or constraint ordering.

**Baseline**: All 43 tests pass. Spectrogram (54 constraints) converges to maxError=0.0000. Tests run in ~6.5s.

**Root Causes of Fragility**:
1. **Finite-difference Jacobians** — the #1 source of fragility. FD derivatives fail near:
   - `atan2` discontinuities at ±π (angle constraints)
   - `sqrt(0)` singularities (distance/length)
   - Branch points (pointOnLine's t clamping)
   - Step size is heuristic (`1e-6 * max(1, |value|, scale)`)
2. **Non-smooth residuals** — `abs()`, branch conditions, `atan2` discontinuities create false local minima
3. **No column scaling** — only row equilibration, not variable scaling

## Architecture Summary

The solver uses Levenberg-Marquardt with:
- Finite-difference sparse Jacobians (forward difference, per-variable perturbation)
- Row equilibration (Jacobian row norm scaling)
- Deterministic multi-start (6 restarts with golden-angle seeding)
- GS escape (3 rounds of projector warmstart → LM after stalling)
- Union-Find decomposition into independent components

36 constraint types, each providing:
- `residual()` — constraint error vector
- `solve()` — GS projector (legacy, used for warm-start)

## Progress Tracker

| # | Change | Tests | maxError (spectrogram) | Status |
|---|--------|-------|------------------------|--------|
| — | Baseline | 43/43 | 0.0000 | ✅ |
| P1 | Analytical Jacobian infrastructure | 55/55 | 0.0000 | ✅ |
| P2 | Analytical Jacobians for 26 constraint types | 55/55 | 0.0000 | ✅ |
| P3 | Hybrid analytical/FD linearizer | 55/55 | 0.0000 | ✅ |

## Experiment Log

### P1: Analytical Jacobian Infrastructure (SUCCESS)
**What**: Added `jacobian` method to `ConstraintDef` interface. Each constraint returns both residuals and partial derivatives w.r.t. entity coordinates directly. The solver maps entity keys (`pt-3.x`, `pt-3.y`, `c-1.r`) to variable indices and fills the Jacobian matrix without any finite-difference perturbation.

**Why it works**: Analytical Jacobians are exact. They eliminate:
- FD step-size sensitivity
- Wrong derivatives near `atan2` discontinuities
- Wrong derivatives near `sqrt(0)` singularities
- ~50% of constraint evaluations (no perturbation pass)

**Result**: Infrastructure in place, 55/55 tests pass.

### P2: Analytical Jacobians for All Constraint Types (SUCCESS)
**What**: Implemented `jacobian()` for 26 constraint types that have residual methods:
- **Trivial** (constant derivatives): coincident, horizontal, vertical, hDistance, vDistance, midpoint
- **Simple** (unit-vector derivatives): distance, length, equal, radius, diameter, equalRadius, concentric, pointOnCircle
- **Medium** (cross/dot product of unit vectors): parallel, perpendicular, collinear, pointOnLine, pointLineDistance, absoluteAngle, angle, angleBetween, lineDistance (2 equations)
- **Complex** (reflection matrix, multi-mode tangency): symmetric, tangent (line-circle and circle-circle modes), lineTangentArc, arcLength
- **Zero-equation** (no Jacobian needed): fixed, ccw
- **Solve-only** (no residual method): shapeWidth, shapeHeight, shapeCentroidX, shapeCentroidY, shapeArea, shapeEqualCentroid

**Result**: All 55 tests pass. All constraints used in the hard test cases (spectrogram, wood cut) now have analytical Jacobians.

### P3: Hybrid Analytical/FD Linearizer (SUCCESS)
**What**: Modified `linearizeSystemAnalytical` to use per-constraint fallback instead of all-or-nothing. Constraints with `jacobian()` get exact derivatives; constraints without fall back to finite-difference for just their rows. This means the linearizer always succeeds (never returns null).

**Why it works**: Even if a component contains one constraint without `jacobian()`, the rest still benefit from exact derivatives. The old FD-only path is now dead code.

**Result**: 55/55 tests pass.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/constraints/types.ts` | Add `jacobian` to `ConstraintDef` |
| `src/forge/sketch/constraints/registry.ts` | Hybrid analytical/FD linearizer, variable key mapping |
| `src/forge/sketch/constraints/defs/coincident.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/horizontal.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/vertical.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/hDistance.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/vDistance.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/midpoint.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/distance.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/length.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/equal.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/radius.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/diameter.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/equalRadius.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/concentric.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/parallel.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/perpendicular.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/collinear.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/pointOnLine.ts` | Analytical Jacobian (branched) |
| `src/forge/sketch/constraints/defs/pointLineDistance.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/lineDistance.ts` | Analytical Jacobian (2 equations) |
| `src/forge/sketch/constraints/defs/absoluteAngle.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/angle.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/angleBetween.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/symmetric.ts` | Analytical Jacobian (reflection) |
| `src/forge/sketch/constraints/defs/tangent.ts` | Analytical Jacobian (line-circle + circle-circle) |
| `src/forge/sketch/constraints/defs/pointOnCircle.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/arcLength.ts` | Analytical Jacobian |
| `src/forge/sketch/constraints/defs/lineTangentArc.ts` | Analytical Jacobian |

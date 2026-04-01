# LM Solver Hardening

**Goal**: Improve LM convergence quality via three targeted changes to `solver/src/solver/lm.rs`:
1. Central-difference FD Jacobian (O(h²) vs current O(h))
2. Nielsen trust-region update (eliminate inner retry loop)
3. Null-space restarts (constraint-aware perturbation)

**Baseline**: All 54 solver tests pass. Test suite runs in ~0.06s.

**Task reference**: `tasks/410-constraint-solver-lm-hardening.md`

---

## Architecture Summary

The LM solver lives in `solver/src/solver/lm.rs`:
- `linearize()` builds the Jacobian — uses analytic Jacobian where available, forward-difference FD for the rest
- `run_lm_pass()` runs the LM iteration loop with a damped trust-region step
- `solve_global()` orchestrates multi-start restarts + GS escape rounds
- `seed_restart()` perturbs state with golden-angle pattern (structure-unaware)

---

## Progress Tracker

| # | Change | Tests Pass | Test Time | Notes |
|---|--------|-----------|-----------|-------|
| — | Baseline (fix test compilation) | 54/54 | ~0.06s | Forward-diff FD, inner retry loop, uniform restarts |
| P1 | Central-difference FD Jacobian | 54/54 | ~0.11s | ✅ O(h²) truncation error, 2× FD evals |
| P2 | Nielsen trust-region update | 54/54 | ~0.10s | ✅ Simpler loop, standard update rule |
| P3 | Null-space restarts | 54/54 | ~0.13s | ✅ Jacobi eigendecomp for null space |

---

## Experiment Log

#### P1: Central-Difference FD Jacobian (SUCCESS)
**What**: Replaced forward-difference `(f(x+h) - f(x)) / h` with central-difference `(f(x+h) - f(x-h)) / (2h)` in the `linearize()` FD loop. Evaluates residuals at both `x+h` and `x-h` for each variable column, collecting forward and backward results before computing the derivative.
**Result**: All 54 tests pass. Test time increased from ~0.06s to ~0.11s (expected — double residual evaluations for FD columns).
**Why it works**: Central differences have O(h²) truncation error vs O(h) for forward differences. This is especially important near degenerate configurations (tangent circles, near-coincident points) where forward-difference error can mislead the solver.
**Lesson**: The 2× eval cost is acceptable given the improved Jacobian accuracy.

#### P2: Nielsen Trust-Region Update (SUCCESS)
**What**: Replaced the 12-iteration inner retry loop with the Nielsen (1999) update rule. One trial step per outer iteration: accept → `λ *= max(1/3, 1-(2ρ-1)³)`, `ν=2`; reject → `λ *= ν`, `ν *= 2`, continue to next outer iteration. Break after 12 consecutive rejects.
**Result**: All 54 tests pass. Test time ~0.10s. The simpler control flow produces equivalent results on existing test cases.
**Why it works**: The Nielsen rule is mathematically well-founded (Madsen et al. 2004, Algorithm 3.16). It avoids the complexity of the inner retry loop while providing the same convergence guarantees. Rejected steps still increase damping but re-linearize at the next iteration, which can find better search directions.
**Lesson**: Simpler is better when backed by theory.

#### P3: Null-Space Restarts (SUCCESS)
**What**: Added `compute_nullspace_basis()` using Jacobi eigenvalue iteration on J^T·J. After the first failed LM pass, eigenvectors with eigenvalues below `1e-6 × max_eigenvalue` form the null-space basis. Subsequent restarts perturb along this basis via `seed_nullspace_restart()` with golden-angle-seeded coefficients, rather than the uniform golden-angle perturbation of `seed_restart()`. Falls back to the original method if null space is empty (fully constrained).
**Result**: All 54 tests pass. Test time ~0.13s (eigendecomposition adds minimal cost for small systems).
**Why it works**: Null-space perturbation moves the state along directions that are locally constraint-satisfying. This lands in a different basin without breaking already-solved constraints, making restart budget much more efficient.
**Lesson**: The Jacobi eigenvalue algorithm is sufficient for the small systems typical in constraint solving (<50 variables). For larger systems (>200 vars), the function skips the computation.

---

## Files Modified

| File | Purpose |
|------|---------|
| `solver/src/solver/lm.rs` | Central-diff FD, Nielsen update, null-space restarts |
| `solver/tests/helpers.rs` | Fixed `groups` field in test Problem constructors |
| `solver/tests/solver_tests.rs` | Fixed `groups` field in arc test |
| `solver/tests/testkit.rs` | Fixed `groups` field in TestSketch |

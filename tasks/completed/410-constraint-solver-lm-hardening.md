# Constraint Solver LM Hardening

## Problem Definition

The Levenberg-Marquardt solver in `solver/src/solver/lm.rs` has concrete weaknesses that cause slow convergence and poor multi-start behavior:

1. The FD Jacobian fallback uses forward differences (O(h) error), which is inaccurate near degenerate configurations (tangent circles, near-coincident points).
2. The trust-region update uses an ad-hoc retry inner loop. The Nielsen (1999) update rule is simpler, standard, and has better convergence guarantees.
3. Multi-start restarts perturb all free points by a random displacement regardless of constraint structure, immediately violating constraints and wasting most of the restart budget re-satisfying easy constraints.

## Description

Harden the Rust LM core without changing the external API or solve pipeline structure. All changes are internal to the Rust solver crate.

Primary files:
- `solver/src/solver/lm.rs` — LM iteration, damping, step acceptance
- `solver/src/constraints/mod.rs` — residuals and Jacobians

## Requirements

### 1. Central-difference FD Jacobian
In `lm.rs`, replace forward differences with central differences for constraints that lack an analytical Jacobian:
```
// Before: (f(x+h) - f(x)) / h
// After:  (f(x+h) - f(x-h)) / (2h)
```
Truncation error drops from O(h) to O(h²). Doubles the residual evaluations for FD columns but improves convergence on degenerate configurations.

### 2. Nielsen trust-region update
Replace the retry inner lambda loop with the Nielsen (1999) update rule:
- One trial step per outer iteration.
- Accept: `lambda *= max(1/3, 1 - (2ρ - 1)³)`, `nu = 2`
- Reject: `lambda *= nu`, `nu *= 2`, continue to next outer iteration (no inner loop).

Reference: Madsen, Nielsen, Tingleff — "Methods for Non-Linear Least Squares Problems" (2004), Algorithm 3.16.

### 3. Null-space restarts
Replace the random perturbation restart with a null-space-aware perturbation:
- At the stuck state, compute the eigenvectors of J^T·J with eigenvalues below a threshold (≈ 1e-6 × max eigenvalue). These span the approximate null space of J.
- Perturb the state vector by a random unit vector in that subspace, scaled by `referenceLength × 0.2`.
- If the null space is empty (fully constrained), fall back to the current golden-angle perturbation.

This moves the system along directions that are locally constraint-satisfying, landing in a different basin without breaking already-solved constraints.

## Status and log
- 2026-03-19: Created from solver architecture review.
- 2026-03-20: Updated file references from TS `registry.ts` to Rust `solver/src/solver/lm.rs`. The LM loop deduplication item was removed — the Rust implementation already has a single LM pass function.

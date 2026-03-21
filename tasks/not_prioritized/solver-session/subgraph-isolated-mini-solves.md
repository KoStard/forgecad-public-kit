# Subgraph-Isolated Mini-Solves — Dirty Group Regeneration

## Problem Definition

When adding a constraint during seeding, the session runs LM on the entire variable space (~120-216 variables). But most constraints only touch 2-8 variables. Solving the full system wastes compute on unaffected regions.

## Description

"Dirty group" regeneration (SolveSpace terminology): when a constraint is added, identify the connected component it belongs to and solve only that subgraph.

Algorithm:
1. Maintain a union-find over variables in `CachedSolverState`, updated when constraints are added
2. On `add_constraint`, find the connected component containing the constraint's variables
3. Extract subgraph: subset of variables + all constraints touching those variables
4. Run mini-LM on subgraph only (4-10 variables instead of 120+)
5. Copy solved positions back to session state

This is similar to the bottom-up decomposition already implemented in `progressive_solve()` (cluster detection + independent internal solves), but applied incrementally during seeding.

## Requirements

- Per-step LM variable count should match the constraint's connected component size
- No regression on convergence quality (final solve must still converge)
- Performance: measurable reduction in per-step linearize time for large models

## Key Files

| File | Change |
|------|--------|
| `solver/src/solver/session.rs` | Union-find maintenance, subgraph extraction in `seed_step()` |
| `solver/src/solver/lm.rs` | `seed_step_lm()` already accepts variable/sparsity subsets |

## Expected Gain

~2× for models with loosely-connected constraint graphs (multiple shapes with few bridge constraints). Less gain for tightly-connected models.

## Status and Log

- 2026-03-21: Identified as P4 in stateful session plan, not started

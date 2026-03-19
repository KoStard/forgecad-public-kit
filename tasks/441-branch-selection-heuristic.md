# Branch Selection Heuristic — Pick the Geometrically Nearest Solution

## Problem Definition

Several constraint patterns have two valid solutions:
- Point at distance D from two known points → two symmetric positions (circle-circle intersection)
- Point at distance D from one known point on a horizontal/vertical line → two positions
- Tangent from external point to circle → two tangent points

The current solver's "branch selection" is implicit: it returns the solution nearest to the initial guess. This works when the initial guess is close to one branch, but fails when:
- All points start at the same location (cold start) — the solver picks a branch arbitrarily
- A previous solve left geometry near the wrong branch — the next solve reinforces it
- The constructive solver (task 420) directly computes both branches — it currently always picks index 0

No explicit branch-selection heuristic exists. This task implements one at the point where multi-solution sub-problems are resolved.

## Description

Add a branch-selection function in Rust that, given two candidate solutions for a sub-problem, returns the one geometrically nearest to the current state of the sketch. Apply it in the constructive solver patterns and the existing analytical presolve.

Primary files:
- `solver/src/solver/constructive.rs` (new, from task 420)
- `solver/src/solver/analytical.rs` — existing patterns that pick solutions (circle-circle, line-circle intersection)

## Requirements

### 1. `select_branch()` utility in Rust

```rust
/// Given two candidate positions for a point, return the one closest to
/// the point's current position.
///
/// Falls back to candidate[0] if the point has no meaningful current position
/// (i.e. it is at the default origin within 1e-6 of all other points).
fn select_branch(
    current: (f64, f64),
    candidates: [(f64, f64); 2],
) -> (f64, f64)
```

The "meaningful current position" check is important: if all free points start at `(0, 1)` (the default), nearest-neighbor is meaningless and we should use a geometric heuristic instead (e.g. pick the solution with the larger Y coordinate for a horizontal pair, to avoid degenerate configurations).

### 2. Apply in analytical.rs

In the circle-circle and line-circle intersection patterns in `solver/src/solver/analytical.rs`, replace any hardcoded solution index with `select_branch()`.

### 3. Apply in constructive.rs (task 420)

All two-solution patterns (`distDist`, `distHorizontal`, `distVertical`) must call `select_branch()`.

### 4. Geometric fallback heuristics (when current position is degenerate)

For cold starts (all points at same location), implement per-pattern defaults that produce non-degenerate geometry:

| Pattern | Default branch |
|---|---|
| `distDist` (two circles) | point with larger Y (above the baseline) |
| `distHorizontal` | point to the right of anchor |
| `distVertical` | point above anchor |
| Circle-circle intersection | intersection with larger Y |

These defaults should be overridable by a `branch_hint` field on the solve context (groundwork for task 440).

### 5. Tests

Add Rust test cases for each pattern showing that:
- From a cold start, the default branch produces non-degenerate, visually reasonable geometry
- From a warm start near branch 0, branch 0 is returned
- From a warm start near branch 1, branch 1 is returned

## Status and log
- 2026-03-19: Created from constraint solver quality review. Depends on task 420 (constructive solver) being in place before full implementation, but `select_branch()` and `analytical.rs` changes can land independently.
- 2026-03-20: Updated from TS to Rust. `analytical.ts` no longer exists; the Rust equivalent is `solver/src/solver/analytical.rs`. All implementation should be in the Rust solver crate.

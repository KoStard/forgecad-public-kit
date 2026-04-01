# Incremental Variable Extension — Activate Broyden Jacobian Reuse

## Problem Definition

The stateful solver session caches a `BroydenHint` (raw Jacobian, variable snapshot, residuals) between seed steps, but the hint is almost never used. `build_variables()` rebuilds the variable array from scratch each step, changing the variable count when new entities are added. The check `broyden_x.len() == vars.len()` fails, discarding the hint.

The Broyden infrastructure (rank-1 update in `linearize()`, FD skip for covered rows, `raw_jacobian` caching) is fully implemented and tested — it just never activates.

## Description

Replace full `build_variables()` + `build_sparsity()` rebuild with append-only incremental extension:

1. **Track existing variable slots** in `CachedSolverState`. On `add_point`/`add_line`/`add_circle`: append to `vars`, `pt_var_idx`, etc. instead of rebuilding.
2. **Extend sparsity incrementally**: On `add_constraint`, compute only the new constraint's row layout and `var_to_constraint_rows` entries. Append to existing `SparsityMap`.
3. **Extend Broyden Jacobian**: Add zero columns for new variables, compute FD rows for new constraints only. Apply Broyden rank-1 update to existing rows.
4. **Handle coord_reduction changes**: When coordinate links change (new Coincident/Horizontal constraints link previously-independent coordinates), invalidate and rebuild the affected variable slots.

## Requirements

- Variable indices must be stable across seed steps (append-only)
- Broyden hint must activate on ≥80% of seed steps in a typical session
- No regression on case_wood (currently 1.7s) or spectrometer
- FD column count should decrease measurably (tracked in profiler `state_capture_count`/`state_apply_count`)

## Key Files

| File | Change |
|------|--------|
| `solver/src/solver/session.rs` | Incremental `build_variables`/`build_sparsity` in `seed_step()` |
| `solver/src/solver/lm.rs` | Already done: `BroydenHint`, `linearize()` Broyden path, `seed_step_lm()` |

## Expected Gain

~2× on top of current 3.4× (per-step linearize ~3ms → ~0.5ms). Diminishing returns — total Rust solve already ~400ms.

## Status and Log

- 2026-03-21: Broyden infrastructure implemented but not activating due to variable layout changes

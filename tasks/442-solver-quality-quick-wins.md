# Solver Quality Quick Wins — Tolerance, Warm-Start, Degenerate Coverage

## Problem Definition

Three independent issues that each cause incorrect or imprecise solver output. None require architectural changes. All have clear fixes.

### Issue 1: Tolerance is too loose (`tolerance = 1e-3`)

The Rust solver's default tolerance in `solver/src/types.rs` is `1e-3`. This means two "coincident" points can be 0.001 units apart and the solver calls it solved. For precision CAD at mm scale, this is visible at typical zoom levels. The builder rejection threshold is `tolerance × 5 = 0.005`, which means a constraint can be rejected even when it's nearly satisfied.

Tighter tolerances are standard in production solvers: D-Cubed DCM uses 1e-6 as its convergence criterion. SolveSpace uses 1e-10.

**Risk**: Tighter tolerance requires more LM iterations per solve. Must benchmark to confirm no interactive regression before committing.

### Issue 2: `warmStartIterations = 0` on interactive edits

In `src/forge/sketch/constraints/sketch.ts::updateConstraintValue()`, the warm-start attempt uses `warmStartIterations: 0`. The previous frame's geometry is the perfect warm start — skipping the GS warm-up pass may be costing convergence quality on the first attempt, forcing the fallback path more often than necessary.

The Rust solver now handles the warm+fallback internally via `fallbackRestarts`, but the initial attempt's warm-start setting still comes from TS.

### Issue 3: Degenerate inputs silently produce wrong geometry

In the Rust residual functions (`solver/src/constraints/mod.rs`), patterns like dividing by line length need safe handling of degenerate cases (zero-length lines, zero-sweep arcs). Degenerate geometry should produce large residuals to push the solver away from the degenerate state, not zero residuals that silently pass.

**Impact**: The builder's test-solve returns "satisfied" for constraints on degenerate entities, silently accepting wrong geometry. These are correctness failures, not performance issues.

## Requirements

### Fix 1: Tighten tolerance

1. Change the default `tolerance` in `solver/src/types.rs` from `1e-3` to `1e-6`.
2. Update `DEFAULT_TOLERANCE` in TS (`src/forge/sketch/constraints/registry.ts`) to match.
3. Run `forgecad check constraints` — measure pass rate and max iteration count.
4. If any tests fail at `1e-6`, determine if it's a genuine convergence failure or a test assertion calibrated to `1e-3`.
5. Run interactive edit benchmark and compare frame time before and after.
6. If interactive regression is <10%, commit the tolerance change.

### Fix 2: Evaluate warm-start for interactive edits

Check whether `warmStartIterations: 0` in the `updateConstraintValue` warm-start attempt is intentional or an oversight. If the GS warm-start pass helps convergence on the first attempt, fewer solves will need the fallback path.

Add a test case: a sketch that requires 100 LM iterations from cold start should require ≤ 10 from a warm start 0.01 units from the solution.

### Fix 3: Replace silent degenerate fallbacks with large residuals

In `solver/src/constraints/mod.rs`, audit all residual functions for divisions by entity lengths or sweep angles. For constraints that are undefined on degenerate geometry:
- Zero-length line + `absoluteAngle`: return a large residual (e.g. `1e6`), not zero.
- Zero-sweep arc + `arcLength`: return a large residual, not `2π`.
- Any `len < 1e-9` guard that substitutes a fallback value: change to return a penalty residual.

Add Rust tests for each degenerate case confirming that the solver is pushed away from the degenerate state.

## Acceptance Criteria

- `forgecad check constraints` passes with tighter tolerance
- Interactive drag on a 20-constraint sketch is within 2ms of the pre-change baseline
- Zero-length line no longer reports "constraint satisfied" for angle constraints
- Zero-sweep arc no longer reports "constraint satisfied" for arc-length constraints

## Status and log
- 2026-03-19: Created from constraint solver quality review.
- 2026-03-20: Updated file references from TS to Rust. The tolerance default is now in `solver/src/types.rs`. Degenerate handling is now in `solver/src/constraints/mod.rs`. The TS `helpers.ts` degenerate patterns (`len || 1`) are no longer in the solver path.

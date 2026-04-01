# Rust/WASM Solver Parity with TypeScript Solver

## Status: COMPLETE

All goals achieved. See [PLAN.md](/docs/temporary/projects/2026/03/19/rust-solver-parity/PLAN.md) for the full experiment log.

## Summary

The constraint solver was migrated from TypeScript to Rust/WASM. The initial Rust solver had 8 failing constraint tests and could not converge the spectrogram model. Over 12 incremental changes, parity was restored and the TS solver surface was reduced to a thin UI/serialization layer.

### Results

- All 74 constraint tests pass (`forgecad check constraints`)
- Spectrogram: `OVER-REDUNDANT DOF=-4 err=0.000608` (matches TS baseline)
- `case_wood_cut.forge.js`: `area=616850.0` (matches TS baseline)
- `case_wood_cut_from_wood.forge.js`: `area=762500.0` (matches TS baseline)
- 54 Rust tests pass (`cargo test`)
- Every TS→Rust solve flow is a single WASM call
- TS retains only: builder ergonomics, serialization, UI display assembly

### Key fixes

1. Restored projector/GS parity for all constraint types
2. Added analytical Jacobians matching the TS constraint defs
3. Fixed LM pass-level state selection (prefer lower error, then lower displacement)
4. Restored `entityRefCount` for presolve branch quality
5. Single-constraint incremental presolve for builder path
6. Rust-owned decomposition, presolve routing, analytical presolve
7. Consolidated all TS orchestration into Rust `SolveOptions`

### Solver source files (current)

- `solver/src/solver/mod.rs` — solve orchestration, presolve, decomposition dispatch
- `solver/src/solver/lm.rs` — Levenberg-Marquardt core
- `solver/src/solver/decompose.rs` — constraint graph decomposition
- `solver/src/solver/analytical.rs` — analytical presolve
- `solver/src/solver/linear.rs` — linear algebra (Cholesky, etc.)
- `solver/src/constraints/mod.rs` — residuals, Jacobians, projectors
- `solver/src/types.rs` — data types and options
- `solver/src/lib.rs` — WASM entry points

## Status and log
- 2026-03-19: Created from solver architecture review.
- 2026-03-20: Marked complete. All parity targets met, TS solver surface fully reduced.

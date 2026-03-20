# Introduce Rust Linting and Formatting

## Problem Definition

The `solver/` crate has no automated formatting or linting. Code style drifts silently, and clippy warnings (correctness, performance, idiomatic Rust) go unnoticed.

## Description

Add `cargo fmt` and `cargo clippy` as standard checks for the Rust solver crate, similar to what `ruff` provides for Python codebases.

## Requirements

1. **Fix existing issues first**
   - Run `cargo fmt` on the solver crate and commit the formatting pass
   - Run `cargo clippy -- -D warnings` and fix all warnings
   - These will likely produce a noisy first diff — do it as a standalone commit

2. **Add config files**
   - `solver/rustfmt.toml` — lock formatting settings (edition, max width)
   - `solver/clippy.toml` — tune thresholds if needed (cognitive complexity, max args)

3. **Integrate into `forgecad check suite`**
   - Add `cargo fmt --check` and `cargo clippy -- -D warnings` to the check suite
   - Fail the suite if either reports issues

4. **Document in CODING_BEST_PRACTICES.md**
   - Add a Rust section covering `cargo fmt`, `cargo clippy --fix`, and `cargo test`

## Status and log

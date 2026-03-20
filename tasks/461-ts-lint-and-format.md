# Introduce TypeScript/JavaScript Linting and Formatting (Biome)

## Problem Definition

The TS/JS codebase has no automated formatting or linting. Code style drifts silently, and common issues (unused imports, inconsistent formatting, type safety gaps) go unnoticed.

## Description

Add [Biome](https://biomejs.dev/) as the single linter + formatter for all TS/JS code, similar to what `ruff` provides for Python and `cargo fmt`/`clippy` for Rust.

Biome is a single Rust-based binary that handles both formatting and linting with auto-fix support. It replaces the need for separate ESLint + Prettier setups.

## Requirements

1. **Fix existing issues first**
   - Install Biome: `npm install --save-dev @biomejs/biome`
   - Run `npx biome format --write .` and commit the formatting pass
   - Run `npx biome check --write .` to auto-fix lint issues, review and commit
   - These will likely produce a noisy first diff — do it as standalone commits

2. **Add config**
   - `biome.json` at repo root — configure formatter (indent, line width) and linter rules
   - Ignore `dist/`, `dist-cli/`, `node_modules/`, `solver/` (Rust has its own tooling)

3. **Integrate into `forgecad check suite`**
   - Add `npx biome check .` to the check suite
   - Fail the suite if it reports issues

4. **Document in CODING_BEST_PRACTICES.md**
   - Add a TS/JS section covering `npx biome check --write .` and `npx biome format --write .`

## Status and log

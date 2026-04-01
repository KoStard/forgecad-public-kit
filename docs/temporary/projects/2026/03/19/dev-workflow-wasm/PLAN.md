# Dev/Build Workflow for Rust/WASM Solver

**Started**: 2026-03-19
**Goal**: Make the dev and build workflows seamless now that the Rust/WASM solver is the only path. No manual "build solver first" steps, no broken states.

---

## Goal & Current State

### Baseline Problems

1. **`npm run dev` doesn't build the solver** — if `solver/pkg/` is missing, you get a cryptic
   import error at runtime, not a helpful message
2. **`forgecad dev` doesn't build the solver** — same problem from the CLI
3. **`source $HOME/.cargo/env &&`** prefix on every solver npm script — fragile, assumes bash,
   doesn't work in fish shell directly
4. **No watch mode** — changing Rust code requires manually re-running `npm run dev:solver`
5. **Confusing script names** — `dev:solver` vs `build:solver:dev` do the same thing
6. **Init error UX** — `initSolverWasm()` throws an opaque dynamic import error when WASM
   isn't built, not the clear error from `solveConstraintsWasm()`

### What "Good" Looks Like

- `npm run dev` just works from a clean checkout (auto-builds solver if missing)
- `npm run dev` rebuilds solver on Rust file changes (watch mode)
- `forgecad dev ../my-project/` just works
- Clear error message when Rust toolchain is missing
- Single `npm run build` for production, no manual steps
- Script names are obvious

---

## Architecture Summary

### Before

```
npm run dev          → vite -- ./examples       (no solver build, breaks if missing)
npm run dev:solver   → source ~/.cargo/env && wasm-pack ...  (bash-only)
npm run build:solver → source ~/.cargo/env && wasm-pack ...  (bash-only)
npm run test:solver  → source ~/.cargo/env && cargo test ... (bash-only)
```

### After

```
npm run dev          → vite (auto-builds solver if missing, watches Rust files)
npm run build:solver → node scripts/solver-build.mjs --release  (any shell)
npm run test:solver  → node scripts/solver-test.mjs  (any shell)
```

---

## Progress Tracker

| # | Change | Works | Notes |
|---|--------|-------|-------|
| — | Baseline | ❌ | `npm run dev` fails if solver not built |
| W1 | Auto-build solver in Vite dev | ✅ | Plugin checks for solver/pkg, builds if missing |
| W2 | Better init error messages | ✅ | Catch import error, rethrow with instructions |
| W3 | Cross-shell build scripts | ✅ | `scripts/solver-build.mjs`, `scripts/solver-test.mjs` |
| W4 | Solver watch mode in dev | ✅ | Vite plugin watches `solver/src/**/*.rs`, rebuilds + full-reload |
| W5 | Clean up script names | ✅ | Removed `dev:solver`, kept `build:solver` + `build:solver:dev` |

---

## Experiment Log

#### W1–W5: Unified Solver Build Workflow (SUCCESS)

**What**: Created `scripts/solver-build.mjs` (cross-shell wasm-pack wrapper) and a Vite plugin
that auto-builds the solver on dev server start and watches Rust files for changes.

**Result**: `npm run dev` now works from a clean checkout. The Vite plugin detects missing
`solver/pkg/solver.js`, builds it, then starts the dev server. When Rust files change,
it rebuilds and sends a full-reload to the browser.

**Key decisions**:
- Node.js scripts instead of shell commands — works on bash, zsh, fish, and Windows
- `--if-missing` flag on solver-build.mjs for fast no-op when already built
- Vite plugin uses chokidar to watch `solver/src/**/*.rs` and `solver/Cargo.toml`
- Rebuild is debounced (mutex flag) to avoid concurrent wasm-pack invocations
- `initSolverWasm()` now catches the import error and rethrows with clear instructions

---

## Files Modified

| File | Purpose |
|------|---------|
| `scripts/solver-build.mjs` | Cross-shell wasm-pack build wrapper |
| `scripts/solver-test.mjs` | Cross-shell cargo test wrapper |
| `vite.config.ts` | `forgeSolverPlugin()` — auto-build + watch |
| `src/forge/sketch/constraints/solver-wasm.ts` | Better error message on init failure |
| `package.json` | Updated scripts to use node scripts |

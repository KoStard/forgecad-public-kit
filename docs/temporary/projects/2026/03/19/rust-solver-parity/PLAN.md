# Rust Solver Parity

## Goal & Current State

### Goal 1

Move the entire 2D constraints solver stack into Rust, with TypeScript reduced to a thin input/output interface only.

That means Rust owns:

- solve orchestration
- decomposition
- presolve
- analytical presolve
- residuals / Jacobians / projector logic
- solve metadata needed by the client to understand the result
- a Rust-native test harness for constructing problems, solving them, rendering SVG, and snapshot-testing behavior

TypeScript should only own:

- user-facing sketch builder ergonomics
- serialization into the Rust problem format
- application of Rust results back onto sketch entities
- display / arrangement / UI-specific interpretation that is downstream of solving

### Goal 2

Make the Rust/WASM path match or beat the last good TypeScript solver from commit `c1b654e` on correctness and large-model behavior.

Current known symptoms from [tasks/430-rust-solver-parity.md](/Users/kostard/Projects/CAD/ForgeCAD/tasks/430-rust-solver-parity.md):

- targeted constraint regressions in the Rust path
- poor convergence on larger coupled systems
- spectrogram regression relative to the TS baseline

Current migration reality:

- the main numerical solve path is already Rust-owned
- TypeScript still contains legacy solver logic in `registry.ts`, `decompose.ts`, `analytical.ts`, per-constraint defs, and the builder's incremental presolve hook
- those TS remnants make it unclear which layer is authoritative and make parity work harder to reason about

## Task Breakdown

### G1.T1 Thin Boundary

Reduce the TS boundary to a thin `ConstraintDefinition -> Rust -> updated geometry + solve metadata` interface.

- remove dead TS solver implementations from `registry.ts`
- stop depending on TS residual / Jacobian / presolve code for correctness
- keep only UI-facing registry data on the TS side

### G1.T2 Rust Solve Metadata

Move solve-adjacent metadata that is still derived in TS into Rust.

- status / DOF computation
- per-constraint residual summaries
- redundancy analysis inputs or results
- any data required to avoid re-running solver math in TS

### G1.T3 Incremental Builder Ownership

Replace the builder-side TS `runSinglePresolve()` branch seeding with a Rust entry point so incremental sketch construction also uses Rust-owned solve logic.

### G1.T4 Rust Test Kit

Add a Rust-native test harness that makes parity work easy to write and debug.

- fluent helpers for points / lines / rects / constraints
- solve and inspect helpers
- SVG renderer for solved sketches
- snapshot tests for visual regression coverage

### G2.T1 Large-Model Baselines

Keep measuring the real parity targets while the migration proceeds.

- `spectrogram.forge.js`
- `case_wood_cut.forge.js`
- `case_wood_cut_from_wood.forge.js`
- `node dist-cli/forgecad.js check constraints`

## Architecture Summary

- TS baseline solver: `src/forge/sketch/constraints/registry.ts` at `c1b654e`
- Rust solver entry: [solver/src/solver/mod.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/solver/mod.rs)
- Rust LM core: [solver/src/solver/lm.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/solver/lm.rs)
- Rust residuals: [solver/src/constraints/mod.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/constraints/mod.rs)
- Current CLI harness: [cli/check-constraints.ts](/Users/kostard/Projects/CAD/ForgeCAD/cli/check-constraints.ts)

Primary hypotheses at start:

1. The Rust LM path is still materially behind the TS solver because it uses FD Jacobians where TS has analytical Jacobians.
2. Some newer constraint types (`blockRotation`, `sameDirection`, `oppositeDirection`) were added after the initial Rust port and can poison larger systems if their residual/presolve behavior diverges.
3. Shape-driven coupled cases depend heavily on presolve quality and warm-start behavior, so the regressions may be a mix of modeling parity and solver-loop parity.

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline capture | Rust path failed 8/8 targeted regressions; TS baseline passed 8/8 | complete |
| 1 | Restore Rust projector / Jacobian / LM parity | Targeted regressions dropped to 0/8; `check constraints` passed | complete |
| 2 | Restore WASM-path presolve reference counts | Spectrogram convergence recovered on the hybrid path | complete |
| 3 | Move main solve orchestration into Rust | Rust now owns decomposition / presolve routing / solve loop; `case_wood_cut*` fixed | partial |
| 4 | Port targeted presolve heuristics into Rust and remove extra projector warm-up | Spectrogram now reaches low residual again under Rust-owned orchestration (`maxError ~= 0.000605`) | complete |
| 5 | Move incremental builder presolve to Rust | Whole-system builder presolve regressed spectrogram; single-constraint Rust presolve restored good branches | complete |
| 6 | Add Rust-native SVG snapshot test harness | Fluent Rust test kit now builds sketches, solves them, renders SVG, and compares snapshots | complete |
| 7 | Delete dead TS decomposition / analytical solver surface | TS no longer exports or runs decomposition / analytical solver APIs; warm-start now talks directly to the Rust boundary | complete |
| 8 | Strip TS constraint defs down to metadata only | TS defs no longer carry presolve / solve / residual / jacobian logic; CLI diagnostics now use Rust metadata only | complete |
| 9 | Remove TS DOF bookkeeping and pebble-game rigidity logic | `analyzeRigidity()` now delegates to Rust solve metadata; TS defs no longer carry `computeDof` hooks | complete |
| 10 | Explain and shrink the surviving TS boundary | every remaining constraints TS file now states its thin role explicitly; dead compatibility helpers were removed; a README now points solver debugging back to Rust first | complete |
| 11 | Add Rust-boundary timing and capture tooling | spectrogram now reports Rust/WASM time directly; the last request/response can be copied as a clean JSON bundle and replayed in Rust tests | complete |

## Remaining TS Solver Surface

This is the explicit removal list for Goal 1:

- `src/forge/sketch/constraints/builder.ts`
  - still needed for fluent sketch authoring in TS, but solving and branch seeding now delegate to Rust
- `src/forge/sketch/constraints/concepts/*`
  - still needed as TS ergonomics macros (`rect`, `polygon`, `regularPolygon`)
- `src/forge/sketch/constraints/defs/*`
  - now purely declarative metadata, labels, and annotation builders; no executable solver behavior remains
- `src/forge/sketch/constraints/helpers.ts`
  - still needed for TS-side annotation/display geometry only
- `src/forge/sketch/constraints/registry.ts`
  - still needed for descriptor registration and UI-facing display assembly around Rust metadata
- `src/forge/sketch/constraints/rigidity.ts`
  - still exists as a compatibility wrapper around Rust metadata for old TS callers
- `src/forge/sketch/constraints/sketch.ts`
  - still owns downstream arrangement/surface generation after Rust returns solved geometry
- `src/forge/sketch/constraints/solver-wasm.ts`
  - still needed as the JSON/WASM bridge until a different client boundary replaces it
- `src/forge/sketch/constraints/types.ts`
  - still duplicates a small amount of TS-facing metadata (`ConstraintDef.equations`, display types) for wrappers and UI
- `cli/check-constraints.ts`
  - still exercises the public TS boundary instead of the Rust crate directly for some end-to-end coverage

## Experiment Log

### Baseline Capture (SUCCESS)
**What**: Measure current Rust/WASM behavior on the task's failing cases, then compare against the TS baseline worktree at `c1b654e`.

**Result**:

| Case | Rust result | Rust time | TS result | TS time |
|------|-------------|-----------|-----------|---------|
| `parallel` | failed, `maxError ~= 0.0598` position drift | `2.87s` | pass | `1.24s` |
| `dual triangle with centroid` | failed, `maxError = 6.925857` | `3.16s` | pass | `1.27s` |
| `case subsystem` | failed, `maxError = 1.670496` | `3.50s` | pass, `maxErr = 0.0000` | `1.33s` |
| `prism holder subsystem` | failed, `maxError = 17.000000` | `3.21s` | pass | `1.27s` |
| `addRect resizable` | failed, `maxError = 9.999619` | `2.13s` | pass | `0.85s` |
| `wrapper rect does not disturb layout` | failed, `maxError = 307.406264` | `47.65s` | pass | `1.16s` |
| `multi-rect CCW winding order` | failed, `maxError = 307.406264` | `64.35s` | pass | `1.07s` |
| `cache: warm-start convergence` | failed, `maxError = 0.999633` | `2.13s` | pass | `0.90s` |

Additional concrete finding:

- Rust warm-start / GS escape is materially incomplete. In [solver/src/constraints/mod.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/constraints/mod.rs), `apply_projector()` only performs real geometry updates for a small subset of constraints. For many constraints that TS actively projects during warm-start and GS escape (`parallel`, `perpendicular`, `midpoint`, `pointOnLine`, `lineDistance`, `shapeEqualCentroid`, `absoluteAngle`, `equal`, and others), Rust currently just computes a residual magnitude and does not move geometry at all.

**Why it matters**: This explains the warm-start regression directly and strongly suggests that several "LM failures" are actually "LM started from a much worse place than TS and never got the same escape path".

**Lesson**: Restore projector parity first, then evaluate whether analytical Jacobians are still required to close the remaining gap.

### Rust Solver Parity Work (SUCCESS)
**What**: Bring the Rust LM path materially closer to the TS baseline by fixing the missing projector behavior, filling in analytical Jacobians for the active constraint types, and correcting LM control-flow differences that were causing premature step rejection.

**Result**:

- [solver/src/constraints/mod.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/constraints/mod.rs)
  - restored real GS/projector motion for `parallel`, `perpendicular`, `equal`, `absoluteAngle`, `midpoint`, `pointOnCircle`, `pointOnLine`, `pointLineDistance`, `lineDistance`, `shapeEqualCentroid`, `ccw`, and `blockRotation`
  - added analytical Jacobians matching the TS constraint defs for the active regression cases
- [solver/src/solver/mod.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/solver/mod.rs)
  - LM now runs whenever the system has any residual-capable constraints or arcs, instead of silently dropping to GS on mixed systems
  - presolve now covers `fixed`, `blockRotation`, `ccw`, `absoluteAngle`, and degenerate `horizontal` / `vertical`
- [solver/src/solver/lm.rs](/Users/kostard/Projects/CAD/ForgeCAD/solver/src/solver/lm.rs)
  - mixed analytical / finite-difference Jacobian assembly
  - rejected LM steps now retry the inner damping loop instead of aborting the pass immediately
  - pass-level state selection now prefers lower-error states and, when error is effectively tied, lower displacement from the pass anchor

**Verification**:

- `node dist-cli/forgecad.js check constraints` → `80 passed, 0 failed`
- `cargo test` in `solver/` → `41 passed`

### Incremental Spectrogram Regression (SUCCESS)
**What**: Investigate why the full spectrogram model still diverged even after the Rust solver itself passed the targeted constraint suite.

**Finding**:

- The remaining failure was not in the Rust residual/Jacobian formulas.
- The WASM migration dropped `entityRefCount` population in [src/forge/sketch/constraints/registry.ts](/Users/kostard/Projects/CAD/ForgeCAD/src/forge/sketch/constraints/registry.ts), so the existing TS-side presolve heuristics no longer knew which geometry was "established".
- That made constraints like `lineDistance` choose worse presolve moves during incremental sketch construction, which pushed the opening/case subsystem onto a bad low-residual branch long before the final solve.

**Fix**:

- Restored the TS baseline `entityRefCount` accumulation in [src/forge/sketch/constraints/registry.ts](/Users/kostard/Projects/CAD/ForgeCAD/src/forge/sketch/constraints/registry.ts) before running presolve for the WASM path.

**Verification**:

- `node dist-cli/forgecad.js run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/16/spectrogram.forge.js`
  - converges as `OVER-REDUNDANT DOF=-4 err=0.000919 constraints=54`
  - build solve time reported by the CLI: `775ms`
  - end-to-end wall time with `/usr/bin/time -p`: `real 2.53`
- `node dist-cli/forgecad.js dev ...` is not a one-shot benchmark in the current CLI; it starts the long-running Vite server, so `run` is the stable timing path for this task.

### Rust-Orchestrated Solve Pipeline (PARTIAL)
**What**: Move the main solve orchestration into Rust so the WASM boundary is closer to a standalone solver library:

- Rust now owns component decomposition (`solver/src/solver/decompose.rs`)
- Rust now owns the main presolve / analytical presolve routing (`solver/src/solver/mod.rs`, `solver/src/solver/analytical.rs`)
- the JS-side `solveConstraints()` path in `registry.ts` is now a thin WASM call instead of doing presolve + analytical + solve orchestration itself

**Result**:

- `cargo test` still passes with two extra Rust integration tests covering:
  - direct-placement analytical presolve with zero LM iterations
  - rectangle orientation preservation with `ccw` + `blockRotation`
- `node dist-cli/forgecad.js check constraints` still reports `80 passed, 0 failed`
- the two previously broken user files now solve to the expected large-layout branches again:
  - `case_wood_cut.forge.js` → `area ~= 616850.0`, `maxError ~= 0.000197`, `12` surfaces
  - `case_wood_cut_from_wood.forge.js` → `area ~= 762500.0`, `maxError ~= 0.000009`, `20` surfaces

**Additional fixes**:

- hardened `cli/collect-files.ts` to skip transient missing files under generated trees instead of crashing validation runs
- hardened CLI solver-profile printing in `cli/test-run.ts` so missing internal timing fields no longer crash the `run` command
- sanitized Rust non-finite solve results so bad states no longer silently serialize as JSON `null`

**What still failed**:

- the full `spectrogram.forge.js` model still regresses under the new Rust-owned orchestration path (`status=over`, `maxError ~= 41.7`, `56` surfaces in direct headless execution)
- the likely remaining gap is incremental branch selection in polygon-heavy builds; the current Rust-side analytical presolve is deliberately restricted back to safe patterns (`coincident`, `hDistance+vDistance`) to avoid making that worse

**Lesson**:

- The remaining migration gap is no longer the rectangle / `blockRotation` family. The hard part left is reproducing the old incremental branch-selection quality for larger polygonal constructions without leaning on TS-side builder heuristics.

### Builder Presolve Ownership (SUCCESS)
**What**: Remove the remaining TS-side incremental builder presolve authority by replacing `builder.ts::runSinglePresolve()` with a Rust/WASM entry point.

**First attempt**:

- Added a Rust `presolve()` entry point and called it from the builder before each incremental solve.
- This was too aggressive. Replaying presolve across the full system during sketch construction reopened the spectrogram regression (`status=over`, `maxError ~= 36.95`, `25` surfaces in direct headless execution).

**Fix**:

- Added a dedicated Rust `presolve_single()` entry point that applies only the newly-added constraint's presolve hook while still using Rust-owned `entityRefCount` and geometry access.
- Updated `builder.ts` to call that Rust function, then run the normal Rust solve.
- Removed the TS `runSinglePresolve()` and `checkResiduals()` solver seam from the builder.

**Verification**:

- Direct headless checks after the builder migration:
  - `spectrogram.forge.js` → `status=over-redundant`, `maxError ~= 0.000986`
  - `case_wood_cut.forge.js` → `area ~= 616850.0`, `maxError ~= 0.000044`
  - `case_wood_cut_from_wood.forge.js` → `area ~= 762500.3`, `maxError ~= 0.000123`
- `node dist-cli/forgecad.js check constraints` still reports `80 passed, 0 failed`

**Lesson**:

- Incremental construction needs finer-grained presolve ownership than the batch solver path. “Rust owns the builder seam” was correct; “re-run full-system presolve on every added constraint” was not.

### Rust Test Kit and SVG Snapshots (SUCCESS)
**What**: Add a Rust-native test harness so solver parity work can stay inside the Rust crate instead of depending on the full TS stack.

**Added**:

- `solver/tests/testkit.rs`
  - fluent point / line / rect construction
  - constraint helpers for common sketch scenarios
  - direct solve wrapper
  - deterministic SVG renderer for solved geometry
  - snapshot comparison helper that writes mismatches to `solver/target/test-snapshots/`
- `solver/tests/svg_snapshot_tests.rs`
  - first SVG snapshot regression test for an upright constrained rectangle
- `solver/tests/snapshots/rect_upright.svg`
  - baseline snapshot artifact

**Verification**:

- `cargo test` now passes with the new snapshot test included

**Lesson**:

- We now have a Rust-only path for writing visual solver regressions. This reduces the need to debug parity issues indirectly through the TS builder / CLI layer.

### Delete TS Decomposition and Analytical APIs (SUCCESS)
**What**: Remove the remaining dead TS solver modules instead of keeping compatibility shims around after Rust became authoritative for decomposition, analytical presolve, and solve metadata.

**Changed**:

- deleted `src/forge/sketch/constraints/decompose.ts`
- deleted `src/forge/sketch/constraints/analytical.ts`
- removed `DecompositionCache`, topology fingerprinting, and cache-aware solve options from the TS public types
- rewired `builder.ts`, `sketch.ts`, and `cli/experiment-perf2.ts` to call the thin Rust solve boundary directly
- trimmed `cli/check-constraints.ts` to stop testing deleted TS-only APIs and added a Rust-side metadata assertion in `solver/tests/solver_tests.rs`

**Verification**:

- `cargo test -q` → passes (`44` solver tests + `1` SVG snapshot integration test)
- `npm run build:solver` → passes
- `npm run build:cli` → passes
- `node dist-cli/forgecad.js check constraints` → `74 passed, 0 failed`
- `node dist-cli/forgecad.js run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/16/spectrogram.forge.js`
  - `OVER-REDUNDANT DOF=-4 err=0.000986`
- `node dist-cli/forgecad.js run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/18/case_wood_cut.forge.js`
  - `area ~= 616850.0`, `maxError ~= 0.000044`
- `node dist-cli/forgecad.js run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/18/case_wood_cut_from_wood.forge.js`
  - `area ~= 762500.3`, `maxError ~= 0.000123`

**Lesson**:

- When Rust owns decomposition and presolve internally, keeping TS decomposition / analytical APIs around only obscures what is still unfinished. Deleting them is cleaner than pretending they are still part of the supported solver boundary.

### Strip TS Constraint Defs to Metadata Only (SUCCESS)
**What**: Remove the legacy solver implementation methods from every TypeScript constraint definition so the defs only describe builder-facing metadata, UI annotation geometry, and TS-side rigidity bookkeeping.

**Changed**:

- stripped `presolve`, `solve`, `residual`, and `jacobian` from `src/forge/sketch/constraints/defs/*.ts`
- removed `SolverContext` and the solver-method fields from `ConstraintDef` in `src/forge/sketch/constraints/types.ts`
- removed the last TS-side residual recomputation path from `cli/check-constraints.ts`; verbose diagnostics now read the Rust-returned residual metadata

**Verification**:

- `npm exec tsc -- --noEmit` → passes
- `npm run build:cli` → passes
- `cargo test -q` → passes
- `node dist-cli/forgecad.js check constraints` → `74 passed, 0 failed`
- `node dist-cli/forgecad.js run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/16/spectrogram.forge.js`
  - `OVER-REDUNDANT DOF=-4 err=0.000986`

**Lesson**:

- The defs are now clearly non-authoritative for solving. The remaining TS residue is not “hidden LM math in defs” anymore; it is structural analysis (`computeDof` / `rigidity.ts`) and some legacy comments/helpers that can now be cleaned up separately.

### Remove TS DOF Bookkeeping and Pebble-Game Rigidity Logic (SUCCESS)
**What**: Delete the last executable TS-side DOF bookkeeping from the constraint defs and replace the old pebble-game rigidity analysis with a thin wrapper over Rust solve metadata.

**Changed**:

- removed `computeDof` from `ConstraintDef` and from all `src/forge/sketch/constraints/defs/*.ts`
- deleted the TS-side `DofContext`
- rewrote `src/forge/sketch/constraints/rigidity.ts` so `analyzeRigidity()` solves a cloned definition through the Rust boundary and derives `totalDof`, `redundantConstraintIds`, and `isRigid` from Rust metadata

**Verification**:

- `npm exec tsc -- --noEmit` → passes
- `npm run build:cli` → passes
- `node dist-cli/forgecad.js check constraints` → `74 passed, 0 failed`
- Level 9 rigidity tests still pass on the Rust-backed path

**Lesson**:

- At this point the TS constraint defs are declarative metadata only. The remaining migration work is mostly cleanup and API-boundary simplification, not moving hidden solver math.

### Explain the Remaining TS Boundary (SUCCESS)
**What**: Make the surviving TS layer self-explanatory and remove the last dead compatibility leftovers so future solver work can focus on Rust without wondering whether TS still hides executable solver behavior.

**Changed**:

- added top-of-file ownership comments across the remaining `src/forge/sketch/constraints/**/*.ts` surface
- added `src/forge/sketch/constraints/README.md` as an explicit inventory of why each TS file still exists
- removed dead helper leftovers from constraint defs (`pointLineRefs`, old direction-flip helpers, old winding helper)
- tightened stale per-constraint docs so they describe Rust as the authoritative solver instead of implying TS-side presolve / solve behavior
- removed a small TS duplication by reusing `cloneDefinition()` from `sketch.ts` inside `rigidity.ts`

**Verification**:

- `npm exec tsc -- --noEmit` → passes
- `npm run build:cli` → passes
- `node dist-cli/forgecad.js check constraints` → `74 passed, 0 failed`

**Lesson**:

- The remaining TS code is now easier to audit: it is either builder ergonomics, registry/display metadata, the WASM bridge, or post-solve UI geometry. If a future constraint regression appears, the default assumption should now be “debug Rust first”.

### Add Rust-Boundary Timing and Capture Tooling (SUCCESS)
**What**: Make the Rust boundary observable enough that a slow or broken UI solve can be moved into a Rust repro with minimal friction.

**Changed**:

- instrumented `src/forge/sketch/constraints/solver-wasm.ts` with per-call timing breakdowns:
  - `serialize`
  - `stringify`
  - `rust/wasm`
  - `parse`
  - `apply`
- added cumulative Rust-boundary stats and source labels (`builder.constrain`, `sketch.solveConstraintDefinition`, `rigidity.analyze`, etc.)
- exposed browser-console helpers on `globalThis.__forgecadSolver`:
  - `enableConsoleDebug()`
  - `resetStats()`
  - `getStats()`
  - `printRecent()`
  - `copyLastExchange()`
  - `copyLastRequest()`
  - `copyLastResponse()`
- added a clean capture bundle format:
  - `{ kind, constraint_id?, request, response }`
  - `request` is the exact JSON sent to Rust
  - `response` is the exact JSON returned by Rust
- added Rust-side replay support in `solver/src/lib.rs` and `solver/src/types.rs`
- added Rust test helpers and a replay regression in `solver/tests/testkit.rs` and `solver/tests/capture_replay_tests.rs`

**Measured result**:

- `node dist-cli/forgecad.js run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/16/spectrogram.forge.js`
  - reported wall-clock in the command: `Time: 2658ms`
  - Rust/WASM boundary totals: `109` calls, `2598ms` total
  - time spent inside Rust/WASM itself: `2592ms`
  - JS boundary overhead on those calls (`serialize + stringify + parse + apply`): about `6ms`
  - final solve call alone: `31ms` total in `solveConstraintDefinition`, `4ms` inside Rust/WASM

**Lesson**:

- On spectrogram, the dominant cost is not JSON marshalling anymore; it is the number of Rust/WASM solve calls during incremental construction. That means the next performance work should target solve frequency / branch stability first, not serialization micro-optimizations.

## Files Modified

| File | Purpose |
|------|---------|
| `docs/temporary/projects/2026/03/19/rust-solver-parity/PLAN.md` | Investigation log for parity work |
| `src/forge/sketch/constraints/registry.ts` | Restored presolve `entityRefCount` parity for the WASM path |
| `src/forge/sketch/constraints/builder.ts` | Restored targeted incremental builder presolve while keeping the main solve path Rust-owned |
| `src/forge/sketch/constraints/sketch.ts` | Warm-start and solve flow now call the Rust solve boundary directly |
| `src/forge/sketch/constraints/types.ts` | Removed TS decomposition-cache types from the public solver boundary |
| `src/forge/sketch/constraints/index.ts` | Stopped exporting deleted TS solver modules |
| `src/forge/sketch/constraints/solver-wasm.ts` | Added Rust presolve bridge APIs for incremental builder seeding |
| `solver/src/lib.rs` | Added Rust-side replay helpers for captured boundary exchanges |
| `solver/src/types.rs` | Added a serializable solve-exchange format shared by UI captures and Rust tests |
| `solver/tests/capture_replay_tests.rs` | Verifies that a captured UI exchange can be replayed directly inside Rust tests |
| `solver/tests/testkit.rs` | Added helper to solve and inspect captured exchange JSON inside Rust tests |
| `src/forge/sketch/constraints/README.md` | Explicit inventory of why the surviving TS boundary still exists |
| `src/forge/sketch/constraints/defs/*.ts` | Removed legacy TS solver methods and `computeDof`, leaving declarative metadata / annotations only |
| `src/forge/sketch/constraints/decompose.ts` | Deleted dead TS decomposition wrapper after Rust became authoritative |
| `src/forge/sketch/constraints/analytical.ts` | Deleted dead TS analytical presolve module |
| `src/forge/sketch/constraints/rigidity.ts` | Replaced TS pebble-game rigidity analysis with a thin Rust-backed wrapper |
| `solver/src/solver/mod.rs` | Rust-owned solve orchestration, presolve sequencing, component solve routing |
| `solver/src/solver/decompose.rs` | Rust component decomposition plan builder |
| `solver/src/solver/analytical.rs` | Rust analytical presolve module |
| `solver/tests/testkit.rs` | Rust-native sketch / solve / SVG snapshot harness |
| `solver/tests/svg_snapshot_tests.rs` | First Rust SVG snapshot regression test |
| `solver/tests/snapshots/rect_upright.svg` | Baseline SVG snapshot for the new Rust test harness |
| `cli/check-constraints.ts` | Removed tests for deleted TS-only solver APIs and kept the boundary focused on Rust-owned behavior |
| `cli/experiment-perf2.ts` | Uses the Rust solve boundary directly for profiling |
| `solver/src/constraints/mod.rs` | Rust residual participation updates and non-finite handling support |
| `solver/src/lib.rs` | Sanitized Rust solve results for JSON/WASM output |
| `solver/src/solver/lm.rs` | Non-finite guards in LM linearization / step generation |
| `solver/tests/solver_tests.rs` | Coverage for Rust orchestration / orientation cases |
| `cli/collect-files.ts` | Robust file collection for CLI validation commands |
| `cli/test-run.ts` | Robust CLI profiling output when internal timing fields are absent |
| `cli/check-constraints.ts` | Uses Rust-returned residual metadata instead of TS residual recomputation |

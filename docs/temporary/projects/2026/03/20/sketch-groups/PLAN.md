# Sketch Groups — Rigid-Body DOF Implementation

## Goal

Replace per-point constraint overhead with 3-DOF rigid-body groups in the solver. A group of N points costs 3 DOF (x, y, θ) instead of 2N, eliminating internal structural constraints entirely.

## Architecture

**Key insight**: Group points expand into the main point/line arrays for residual evaluation. The solver variable set replaces individual point variables with group frame variables (gx, gy, gθ). FD Jacobian automatically captures chain-rule derivatives by resolving group points from the frame before each residual evaluation.

**What changes:**
- `types.rs`: SketchGroup, LocalPoint, GroupResult structs
- `solver/mod.rs`: Group expansion before solving, GroupInfo passing
- `solver/lm.rs`: Group-aware build_variables, capture_state, apply_state, build_sparsity
- `solver/decompose.rs`: Groups in union-find
- `lib.rs`: WASM boundary for groups
- `types.ts`, `solver-wasm.ts`, `builder.ts`: TS group API
- `concepts/groupRect.ts`: Rect-as-group convenience

**What doesn't change:**
- All constraint residual functions (they work in world coords)
- LM solver core, decomposition algorithm
- Constraint builder API for constraints between groups

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| 1 | Rust data types (types.rs) | ✅ |
| 2 | Group expansion (solver/mod.rs) | ✅ |
| 3 | Group-aware LM solver (lm.rs) | ✅ |
| 4 | Union-find groups (decompose.rs) | ✅ (no changes needed) |
| 5 | WASM boundary (lib.rs) | ✅ |
| 6 | TS types & WASM glue | ✅ |
| 7 | TS builder group API | ✅ |
| 8 | groupRect concept | ✅ |
| 9 | WASM build + validation | ✅ 74 tests pass |
| 10 | Model rewrites (3 models) | ✅ |

## Experiment Log

#### sk.fix() on group-owned points (FAILED)
**What**: Attempted to use `sk.fix()` to pin group-owned points.
**Result**: `sk.fix()` has no effect on group-owned points — it's a presolve-only constraint (`equation_count=0`, `has_residual=false`) that sets `point.fixed=true`, but `resolve_group_points()` overwrites the position from the group frame.
**Lesson**: Added validation in `fix()` that throws an error when called on a group-owned point. Users should use `g.fix()` for the whole group or constraint-based positioning (coincident, distance).

#### Fixed group + complex constraints (FAILED)
**What**: Inner equilateral triangle as a fixed group in the spectrogram model. All 3 DOF frozen, geometry baked into local coords.
**Result**: Solver convergence failure (err=1.009). Isolated tests work, but the full model with opening rectangle and camera holder fails.
**Why**: The fixed group places inner triangle at its exact final position while other geometry starts at default positions. The solver can't converge from this asymmetric state — lineDistance/shapeEqualCentroid between a precisely-positioned fixed group and far-away initial free points creates poor conditioning.
**Lesson**: Fixed groups work when the rest of the system has reasonable initial positions near the solution. For models with complex interdependencies and bad initial positions, using constraint-defined geometry (the original approach) converges better.

#### groupRect for rigid rectangles (SUCCESS)
**What**: `sk.groupRect({ width, height })` replaces `addPolygon + parallel + perpendicular + length` for rectangles with known dimensions.
**Result**: Both case_wood_cut models converge correctly. case_wood_cut: DOF=-11, err=0.000516. case_wood_cut_from_wood: DOF=-16, err=0.000197.
**Lesson**: Groups work excellently for rigid components with known dimensions positioned by inter-component constraints. The wrapper rectangle (whose dimensions are determined by content) correctly uses `sk.rect()` instead of `groupRect`.

## Files Modified

| File | Purpose |
|------|---------|
| `solver/src/types.rs` | SketchGroup, LocalPoint, GroupResult, Problem.groups |
| `solver/src/solver/mod.rs` | expand_groups(), resolve_group_points(), DOF calculation |
| `solver/src/solver/lm.rs` | Group-aware variable system, sparsity, state management |
| `solver/src/lib.rs` | WASM boundary for groups |
| `src/forge/sketch/constraints/types.ts` | TS group types |
| `src/forge/sketch/constraints/solver-wasm.ts` | Serialize/apply groups across WASM boundary |
| `src/forge/sketch/constraints/builder.ts` | Group builder API, fix() validation for group-owned points |
| `src/forge/sketch/constraints/concepts/groupRect.ts` | Rect as rigid group |
| `src/forge/sketch/constraints/concepts/index.ts` | Register groupRect |
| `src/forge/sketch/constraints/index.ts` | Export group types |
| `src/forge/sketch/constraints/sketch.ts` | Deep clone groups in cloneDefinition |
| `src/forge/forge-api.d.ts` | Group type declarations |

## Model Results

| Model | Groups Used | DOF | Error | Status |
|-------|------------|-----|-------|--------|
| `spectrogram.forge.js` | None (constraint-determined geometry) | -4 | 0.000608 | ✅ |
| `case_wood_cut.forge.js` | groupRect × 11 rigid rectangles | -11 | 0.000516 | ✅ |
| `case_wood_cut_from_wood.forge.js` | groupRect × 15 rigid rectangles | -16 | 0.000197 | ✅ |

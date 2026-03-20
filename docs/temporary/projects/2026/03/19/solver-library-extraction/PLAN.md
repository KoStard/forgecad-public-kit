# Can the Constraint Solver Be a Standalone Library?

**Type**: Architecture exploration (no code changes)
**Date**: 2026-03-19

## TL;DR

**Yes, absolutely.** The Rust solver is already 95% standalone. It has zero ForgeCAD-specific dependencies — just `serde`, `serde_json`, and optionally `wasm-bindgen`. The remaining 5% is the thin WASM glue in `lib.rs`. Extracting it would give us a reusable 2D constraint solver that works as a Rust crate, a WASM module, and a C FFI library.

---

## Current Architecture

### What the Rust solver actually depends on

```
solver/Cargo.toml dependencies:
  - serde (serialization)
  - serde_json (JSON wire format)
  - wasm-bindgen (WASM glue — optional)
  - console_error_panic_hook (WASM debugging — optional)
```

**Zero ForgeCAD dependencies.** The solver doesn't import anything from the TS codebase. It's already a self-contained Rust crate that happens to live inside the ForgeCAD monorepo.

### Boundary between solver and ForgeCAD

The current data flow is:

```
ConstrainedSketchBuilder (TS)
  → validates inputs (entity existence, finite numbers)
  → decompose.ts: Union-Find decomposition into components
  → solver-wasm.ts: JSON serialize → WASM solve() → JSON deserialize
  → applies results back to TS entity objects
  → sketch.ts: builds display, detects regions, computes DOF
```

**What lives where today:**

| Concern | Location | Solver? |
|---------|----------|---------|
| Numerical solver (LM + GS escape) | `solver/src/solver/lm.rs` | ✅ Core |
| Constraint residuals & Jacobians | `solver/src/constraints/mod.rs` | ✅ Core |
| Presolve pipeline (routing) | `solver/src/solver/mod.rs` | ✅ Core |
| Linear algebra (Cholesky) | `solver/src/solver/linear.rs` | ✅ Core |
| Entity/constraint types | `solver/src/types.rs` | ✅ Core |
| WASM glue (JSON in/out) | `solver/src/lib.rs` | ⚡ Thin wrapper |
| Union-Find decomposition | `decompose.ts` (TS) | 🔶 Could be either side |
| Analytical presolve | `analytical.ts` (TS) | 🔶 Could be either side |
| Rigidity analysis | `rigidity.ts` (TS) | 🔶 Could be either side |
| Input validation | `builder.ts` (TS) | ❌ ForgeCAD concern |
| Display/annotation | `registry.ts`, `sketch.ts` (TS) | ❌ ForgeCAD concern |
| Region detection (DCEL) | `sketch.ts` (TS) | ❌ ForgeCAD concern |

---

## Proposed Library API

### Level 1: Pure Rust API (the core library)

```rust
// crate: forge-solver (or constraint-solver-2d)

/// The Problem struct — entities + constraints + options.
/// Already exists as-is in types.rs.
pub struct Problem { ... }

/// Solve result — updated positions + convergence info.
pub struct SolveResult { ... }

/// Primary entry point — no WASM, no JSON, just Rust types.
pub fn solve(problem: &mut Problem) -> SolveResult;

/// Decompose into independent sub-problems (currently in TS).
pub fn decompose(problem: &Problem) -> Vec<SubProblem>;

/// Solve with decomposition (convenience).
pub fn decompose_and_solve(problem: &mut Problem) -> SolveResult;
```

This is literally `solve_problem()` from `lib.rs:66` — it already exists.

### Level 2: JSON API (language-agnostic)

```rust
/// JSON string in, JSON string out. Already exists.
pub fn solve_json(problem_json: &str) -> String;
```

### Level 3: WASM binding (browser/Node)

```rust
#[wasm_bindgen]
pub fn solve(problem_json: &str) -> String; // Already exists
```

### Level 4: C FFI (Python, etc.)

```rust
#[no_mangle]
pub extern "C" fn solver_solve(
    problem_json: *const c_char,
    result_buf: *mut c_char,
    buf_len: usize,
) -> i32;
```

### What the TypeScript client would look like

```typescript
import { solve } from 'forge-solver-wasm';

// Exactly the same as today — the API doesn't change
const result = solve(JSON.stringify(problem));
```

No change for ForgeCAD. The extraction is transparent to the consumer.

---

## What Should Move Into the Library vs. Stay in ForgeCAD

### Definitely in the library (already there)
- LM solver with trust region
- GS escape heuristic
- All constraint residuals and analytical Jacobians
- Sparsity structure computation
- Linear algebra (Cholesky, Gaussian elimination)
- Entity and constraint type definitions
- Presolve pipeline

### Strong candidates to move in
- **Union-Find decomposition** (`decompose.ts`, ~200 lines) — purely graph-algorithmic, no ForgeCAD types. Moving it to Rust eliminates JSON round-trips for multi-component problems (serialize once → decompose → solve all components → deserialize once).
- **Analytical presolve** (`analytical.ts`) — closed-form geometric solutions. These are math, not UI.

### Should stay in ForgeCAD
- `ConstrainedSketchBuilder` — fluent API, input validation, entity management. This is the user-facing API.
- Display annotations, DOF visualization, label placement — UI concerns.
- Region detection (DCEL arrangement) — downstream of solving, ForgeCAD-specific.
- Constraint self-registration module augmentation pattern — TS-specific DX.

---

## Testing in Isolation

### Current test situation
- Rust side: `cargo test` runs unit tests (uses `solve_problem()` directly — no WASM)
- TS side: `cli/check-constraints.ts` has 70+ test cases but they go through the full ForgeCAD stack

### What standalone testing would look like

**Rust unit tests** (already work):
```rust
#[test]
fn two_points_distance_30() {
    let problem = Problem {
        points: vec![
            Point { id: "p1".into(), x: 0.0, y: 0.0, fixed: true },
            Point { id: "p2".into(), x: 10.0, y: 0.0, fixed: false },
        ],
        lines: vec![],
        circles: vec![],
        arcs: vec![],
        shapes: vec![],
        constraints: vec![
            Constraint::Distance { id: "c1".into(), a: "p1".into(), b: "p2".into(), value: 30.0 },
        ],
        options: None,
    };
    let result = solve_problem(problem, None);
    assert!(result.max_error < 1e-6);
    assert!((result.points[1].x.powi(2) + result.points[1].y.powi(2)).sqrt() - 30.0 < 1e-6);
}
```

**JSON-level integration tests** (language agnostic):
```
tests/
  fixtures/
    simple-distance.json        → expected: max_error < 1e-6
    triangle-fully-constrained.json
    spectrogram-complex.json    → the real stress test
    overconstrained.json        → expected: max_error > threshold
    underconstrained.json       → expected: solves (multiple solutions OK)
```

These fixtures are just `Problem` JSON files. Any language binding can run them:
- `cargo test` reads them directly
- Node: `const result = JSON.parse(solve(fs.readFileSync('fixture.json')))`
- Python: same via cffi
- CLI: `forge-solver < fixture.json`

**The 70+ CLI test cases could be converted to fixtures** — they already define problems in code, just need to be serialized to JSON. This would give the standalone library a comprehensive test suite from day one.

### Property-based testing opportunities
A standalone solver is perfect for property-based testing:
- Generate random entity configurations
- Apply random constraints
- Verify: if solver reports max_error < ε, all constraints actually satisfy within ε
- Verify: fixed points don't move
- Verify: adding redundant constraints doesn't change the solution
- Verify: decomposition gives same result as monolithic solve

---

## What Would the Extraction Actually Involve?

### Minimal extraction (1-2 hours)
1. Move `solver/` to its own repo or workspace member
2. Add `crate-type = ["rlib"]` (already has it)
3. Publish to crates.io or use as git dependency
4. ForgeCAD's `solver-wasm.ts` imports from the published WASM package instead of `../../solver/pkg/`

**Literally nothing breaks.** The current `solver/` directory is already structured as a standalone crate.

### Full extraction (move decomposition + analytical presolve to Rust)
1. Port `decompose.ts` Union-Find to Rust (~200 lines → ~150 lines Rust)
2. Port `analytical.ts` to Rust
3. New Rust API: `decompose_and_solve()` does everything in one WASM call
4. TS side becomes even thinner: serialize → call → deserialize

**Benefit**: One JSON round-trip instead of N (one per component). For the spectrogram case with multiple independent clusters, this could matter.

---

## What the Library Wouldn't Be

Worth noting what this is **not**:
- **Not a general geometric kernel** — it only solves 2D constraints on points, lines, circles, arcs, and shapes
- **Not a parametric modeler** — it doesn't know about features, history, or extrusions
- **Not a sketch editor** — no UI, no undo, no selection
- **Not CAD-specific** — could be used for any 2D constraint problem (diagram layout, physics simulation, robotics kinematics)

This is a **2D geometric constraint solver** — a well-defined, reusable mathematical primitive.

---

## Open Questions

1. **Should decomposition live in the library?** Pro: eliminates multi-call overhead, single responsibility. Con: adds complexity, TS decomposition works fine today.

2. **Should the library validate inputs?** Currently the Rust solver silently returns residual=[0] for missing entities. The builder validates on the TS side. A standalone library probably should validate and return proper errors.

3. **Naming**: `forge-solver` (branded) vs `constraint-solver-2d` (generic) vs `sketch-solver`?

4. **Should constraint definitions be extensible?** The current enum is closed. A plugin system (trait-based) would be more library-like but adds complexity.

5. **Should the library do DOF analysis?** Currently done in TS (`rigidity.ts`). It's pure math — could live in the library.

---

## Verdict

The solver is **already effectively a standalone library** — it just needs to be published as one. The extraction cost is minimal because the boundaries are clean. The Rust crate has no ForgeCAD dependencies. The JSON wire format is the API contract. Tests can run in pure Rust with zero ForgeCAD infrastructure.

The biggest win from formalizing this would be:
1. **Confidence via isolated testing** — property-based tests, fuzzing, benchmark suite
2. **Reusability** — any project needing 2D constraint solving can use it
3. **Forcing clean boundaries** — makes it impossible to accidentally couple solver logic with UI concerns

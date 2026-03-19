# Constraint Solver: Constructive-First Architecture

## Problem Definition

### The root issue: one algorithm for three different problems

Geometric constraints fall into three fundamentally different categories that call for different math. The current solver routes all three through LM, which is only the right tool for one of them.

**Type A — Smooth equality constraints** (LM is correct)
- Distance, tangency, parallel, perpendicular, equal lengths, concentric
- Have smooth residuals and well-defined Jacobians. LM converges quadratically. No better general approach.

**Type B — Direct placement** (constructive — no Jacobian needed)
- Absolute angle with one known endpoint, horizontal/vertical with one fixed point, point at line-line intersection
- These are *calculation* problems, not optimization problems. The answer is a closed-form formula — one step, exact. Running LM on them is applying a search algorithm to find 2+2.

**Type C — Discrete / topological** (GS projector only — Jacobian is meaningless)
- CCW winding order, "which side of a line," fixed orientation
- These are sign decisions, not gradient-descent problems. CCW is already correctly handled (`equations: 0`, presolve + GS only). It shouldn't touch LM.

**The current architecture has the right layers in theory.** In practice, the constructive layer (Type B) is nearly empty, so LM receives constraints it shouldn't. The GS warm-up partially compensates — it's doing constructive propagation via projectors — but imprecisely (GS converges slowly) and without formally marking entities as "determined," so LM re-optimizes over them anyway.

**Note on block rotation and sketch groups:** If ForgeCAD adds sketch blocks or component-level rotation constraints, these must *not* be modeled as LM constraints. A rigid-body transform applied to a group of points before the solver runs is O(n) arithmetic. As an LM constraint it creates a dense block in J coupling the rotation angle to every internal point — expensive and unnecessary. This is a design boundary to enforce early.

Production solvers like D-Cubed DCM and SolveSpace are **constructive-first**: they decompose the sketch into a dependency graph, solve sub-problems sequentially by direct geometry, and only call a numerical solver for the Type A residual. This is deterministic, has no local minima, and doesn't need restarts.

## Description

Add a constructive solver layer in Rust that runs after the existing analytical presolve and before LM. It should handle the common 1-and-2-constraint patterns that cover the majority of real sketches. LM becomes a fallback for genuinely tangled sub-graphs that can't be solved constructively.

Primary files:
- `solver/src/solver/constructive.rs` (new)
- `solver/src/solver/mod.rs` — wire into `solve_single_system()` between `run_analytical_presolve()` and `lm::solve_global()`

## Requirements

### 1. Constructive pattern interface (Rust)

Create `solver/src/solver/constructive.rs` with a pattern trait:

```rust
trait ConstructivePattern {
    /// Returns IDs of entities this pattern would fully determine, or None.
    /// `known` = set of entity IDs already determined (fixed or previously solved).
    fn matches(&self, constraints: &[&Constraint], known: &HashSet<&str>, ...) -> Option<Vec<String>>;

    /// Solve: write determined positions directly into points/circles/arcs.
    fn solve(&self, constraints: &[&Constraint], points: &mut [Point], ...) -> bool;
}
```

### 2. Implement the core pattern set

At minimum, implement these patterns:

**Single-constraint patterns** (one unknown entity, one constraint):
- `fixedPoint` — point.fixed = true → already known, trivial
- `horizontal` — one endpoint known, other determined by horizontal constraint
- `vertical` — same for vertical
- `radius` — circle with known center + radius constraint → determines radius
- `pointOnLine` — known line, point constrained to lie on it + one more scalar

**Two-constraint patterns** (one unknown point, two constraints):
- `distDist` — distance from two known points → circle-circle intersection (two solutions, pick nearest)
- `distHorizontal` — distance from known point + horizontal alignment → two solutions
- `distVertical` — distance from known point + vertical alignment → two solutions
- `distAngle` — distance from known point + angle from known line → one solution

**These cover the vast majority of hand-drawn sketches.**

Note: some of these patterns already exist partially in `solver/src/solver/analytical.rs` (the existing `run_analytical_presolve`). The constructive layer should subsume and extend that work.

### 3. Constructive solve loop

A fixed-point iteration in Rust that repeatedly scans remaining constraints, trying each pattern. When a pattern matches and solves, mark the determined entities as known and remove the consumed constraints. Stop when no more progress is made.

### 4. Wire into solve_single_system()

In `solver/src/solver/mod.rs::solve_single_system()`, after `run_analytical_presolve()` and before `lm::solve_global()`:

```rust
let constructively_known = constructive_solve(points, lines, circles, arcs, shapes, constraints, tolerance);
// Mark constructively-solved points as fixed so LM doesn't move them
for p in points.iter_mut() {
    if constructively_known.contains(&p.id) { p.fixed = true; }
}
```

Restore fixed flags after LM.

### 5. Acceptance criteria

- A sketch with two points and a distance constraint solves constructively (zero LM iterations).
- A triangle (3 points, 3 distance constraints, one fixed point) solves constructively.
- LM iteration counts drop measurably across the existing test suite.
- `forgecad check constraints` still passes (74/74).
- Spectrogram model still converges to `err < 0.001`.

## Status and log
- 2026-03-19: Created from solver architecture review.
- 2026-03-20: Updated from TS to Rust. The implementation target is now `solver/src/solver/constructive.rs`, not TS files. `decompose.ts` and `analytical.ts` no longer exist in TS; Rust owns decomposition (`solver/src/solver/decompose.rs`) and analytical presolve (`solver/src/solver/analytical.rs`). The constructive layer extends the existing Rust analytical presolve.

# Sketch Groups — Rigid-Body DOF Instead of Per-Point Constraints

## Problem Definition

When a user wants to move, rotate, or constrain a *group* of geometry as a unit, the naive model is: add constraints between every internal point and some target. This is wrong. It creates a dense block in the Jacobian (the rotation angle couples to every point in the group), wastes solver iterations having LM "discover" a rigid-body relationship it could have been told about directly, and scales O(n) in group size where O(1) is correct.

The right model, used by SolidWorks sketch blocks and every production CAD kernel: a group has its own **local coordinate frame** (x, y, θ). Internal points are stored in local coordinates and transformed to world coordinates by the frame. The solver sees **3 DOF per group** regardless of how many points are inside it. Constraints between a group point and external geometry are expressed in world coordinates via the transform — they look identical to ordinary constraints.

This is not a constraint feature. It is a coordinate representation feature. The solver does not change; the variable set changes.

---

## Architecture

### Data model

```rust
struct SketchGroup {
    id: String,
    // Frame DOF — what the solver optimizes over
    x: f64,      // world position of local origin
    y: f64,
    theta: f64,  // rotation angle (radians)
    fixed: bool, // if true, all 3 DOF are frozen
    // Internal geometry (in local coordinates — never touched by solver directly)
    points: Vec<LocalPoint>,   // { id, lx, ly }
    lines: Vec<LocalLine>,     // { id, a, b }
    // ... arcs, circles as needed
}
```

World position of a local point `(lx, ly)` in group with frame `(x, y, θ)`:
```
wx = x + lx·cos(θ) - ly·sin(θ)
wy = y + lx·sin(θ) + ly·cos(θ)
```

### Solver variable set

Currently: one variable per free point coordinate → `[x0, y0, x1, y1, ...]`.

With groups: group frames add `[gx, gy, gθ]` per group; internal points are not solver variables — they are computed from the frame.

The Jacobian column for a constraint residual that involves a group point `(lx, ly)` with respect to group DOF `(gx, gy, gθ)`:
```
∂r/∂gx  = ∂r/∂wx · 1          (translation x)
∂r/∂gy  = ∂r/∂wy · 1          (translation y)
∂r/∂gθ  = ∂r/∂wx · (-lx·sin θ - ly·cos θ)
         + ∂r/∂wy · ( lx·cos θ - ly·sin θ)
```

This is the chain rule applied once. Every existing constraint residual already computes `∂r/∂wx` and `∂r/∂wy` — no residual functions change. Only the variable-to-coordinate mapping changes.

### What doesn't change

- All constraint residual functions in `solver/src/constraints/mod.rs`: they work in world coordinates, unchanged.
- The LM solver core in `solver/src/solver/lm.rs`, decomposition in `solver/src/solver/decompose.rs`.
- The constraint builder API for constraints *between* groups or between a group and free geometry.

### What changes

- Variable extraction in `solver/src/solver/lm.rs`: instead of flattening all free point coords, also include group frame DOF.
- World-coordinate resolution: before evaluating any residual, resolve group points to world coords via the frame transform.
- Jacobian assembly: for constraints touching a group point, compute the chain-rule columns for `(gx, gy, gθ)` rather than `(wx, wy)`.
- Serialization in `solver/src/types.rs`: group frames serialize as `{ id, x, y, theta }` + internal local-coordinate geometry.
- TS-side builder in `src/forge/sketch/constraints/builder.ts`: new `group()` method returning a `SketchGroupBuilder`.

---

## Requirements

### 1. `SketchGroup` entity type (Rust)

Add `SketchGroup` to `solver/src/types.rs`. A group:
- Has a mutable frame `(x, y, θ)` that the solver optimizes
- Contains local-coordinate points, lines, arcs — immutable during solve (only the frame moves)
- Can be `fixed` (frame frozen, same as a fixed point)
- Can be partially constrained (e.g., `fixedRotation` freezes θ only — 2 remaining translation DOF)

### 2. World-coordinate resolver (Rust)

```rust
fn resolve_group_point(group: &SketchGroup, local_id: &str) -> (f64, f64) {
    let lp = group.points.iter().find(|p| p.id == local_id).unwrap();
    let (cos_t, sin_t) = (group.theta.cos(), group.theta.sin());
    (
        group.x + lp.lx * cos_t - lp.ly * sin_t,
        group.y + lp.lx * sin_t + lp.ly * cos_t,
    )
}
```

All constraint residual evaluation routes group-owned points through this before computing geometry.

### 3. Jacobian chain rule for group DOF

In `solver/src/solver/lm.rs`, when a constraint touches a group point, emit Jacobian entries for `(gx, gy, gθ)` instead of `(wx, wy)`. The chain-rule factors above are exact — no finite differences needed for the group transform itself.

### 4. Builder API (TS)

```ts
sk.group(id?: string): SketchGroupBuilder
  .point(lx, ly): LocalPointId        // add point in local coords
  .line(a: LocalPointId, b: LocalPointId): LocalLineId
  .fixRotation(): this                 // freeze θ, allow translation
  .fix(): this                         // freeze all 3 DOF
  .at(x, y, theta?): this             // set initial frame position

// Constraints between a group point and external geometry look identical
sk.coincident(group.point('p1'), freePoint)
```

### 5. Internal constraints are not solver constraints

A distance constraint between two points in the same group has a fixed value determined by local coordinates — it cannot vary. Strip these from the equation system. If internal constraints are violated, report at group-creation time, not solve time.

### 6. Acceptance criteria

- A group of 10 points with 3 external constraints solves in the same iteration count as 1 external point with 3 constraints (both have 3 free DOF).
- Rotating a group by changing θ produces zero residual change for all-internal constraints.
- `forgecad check constraints` passes with groups included in test cases.
- Profile: J has exactly 3 columns per group regardless of group size.

---

## Connection to sketch blocks (SolidWorks model)

SolidWorks sketch blocks are this feature. The constraint solver sees the block's `(x, y, θ)` and the constraints between the block and the rest of the sketch. Internal block geometry is frozen in local coordinates. This makes complex reusable geometry (bolt hole patterns, standard profiles) treat as single solver entities.

The ForgeCAD equivalent does not need a UI "block" abstraction immediately — the data model and solver support can land first, with UI later.

---

## Status and log
- 2026-03-19: Created from constraint solver architecture review.
- 2026-03-20: Updated from TS to Rust. The solver variable set, Jacobian assembly, and group resolution are all in the Rust crate now. The TS side only needs the builder ergonomics and serialization for group frames.

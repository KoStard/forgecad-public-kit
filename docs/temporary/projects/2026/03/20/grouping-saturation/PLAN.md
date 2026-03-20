# Investigation: Is Grouping Saturated? What's Next?

**Date**: 2026-03-20
**Type**: Architecture exploration (plan only — no code changes)

## Goal

Assess whether the "grouping" feature branch in the constraint solver has reached diminishing returns, or if there are high-value improvements that would significantly change the user experience.

## Current State Assessment

### What exists today

The grouping system implements **rigid-body 3-DOF groups** (x, y, θ):

| Capability | Status | Notes |
|-----------|--------|-------|
| Rigid-body frame (x, y, θ) | ✅ Done | Solver substitutes 3 DOF for 2N point DOF |
| `fixRotation()` (2 DOF) | ✅ Done | Freezes θ |
| `fix()` (0 DOF) | ✅ Done | Freezes all 3 |
| Sparse Jacobian for groups | ✅ Done | Maps constraints to group frame columns |
| World-coord resolution pipeline | ✅ Done | `resolve_group_points()` after every update |
| Builder fluent API | ✅ Done | `sk.group()` → `.point()` → `.line()` → `.done()` |
| `groupRect` concept | ✅ Done | Single high-level concept |
| DOF counting for groups | ✅ Done | `dof_count()` method |
| Serialization TS↔Rust | ✅ Done | Group-owned entities filtered correctly |
| Redundancy detection | ✅ Done | `VariableRef` tracks group vars |

### What's missing / partially done

| Gap | Impact | Notes |
|-----|--------|-------|
| Intra-group constraint stripping | Low | Spec says internal constraints should be no-ops; currently pass through (harmless but wasteful) |
| Only 1 group concept (`groupRect`) | **High** | `polygon`, `regularPolygon` have no group equivalents |
| No group-level constraints | **High** | Can't say "align group A's frame to group B" |
| No `groupPolygon` / `groupRegularPolygon` | **High** | Users must manually build groups for non-rect shapes |
| No symmetry/pattern across groups | **High** | Linear/circular array patterns are a fundamental CAD operation |
| No partial DOF locking (fix X only, fix Y only) | Medium | `fixed_rotation` exists but no axis-specific translation lock |
| No group nesting | Low | Groups can't contain sub-groups |
| No "convert to group" from free geometry | Medium | Can't take an existing constrained shape and rigidify it |

## Verdict: Is grouping saturated?

**No. The infrastructure is solid but the experience layer is thin.**

The solver-side work is essentially complete — rigid-body DOF substitution, Jacobian routing, sparsity, world-coord resolution all work correctly. But the user-facing API offers only:

1. A low-level `sk.group()` builder (manual point/line placement)
2. One high-level concept (`groupRect`)

Compare this to non-grouped geometry which has `rect`, `polygon`, `regularPolygon` — each with rich handles (named vertices, sides, center points, shapes). The grouping equivalent of these doesn't exist.

**The gap is not in the solver. It's in the concept library and inter-group constraint vocabulary.**

---

## What would make grouping significantly better

### Tier 1: Group concept library (high impact, moderate effort)

These are direct analogs of existing non-group concepts, but rigid by construction.

#### 1a. `groupPolygon(points, opts)`

Like `addPolygon` but all points are in a rigid group. No structural constraints needed (no `ccw` — winding is fixed by local coords). Returns `ConstrainedGroupPolygon` handle with `.vertices`, `.sides`, `.shape`.

**Why it matters**: Every polygon the user knows is rigid should be a group. Currently they must use the low-level `sk.group()` API and manually add points/lines.

**DOF**: 3 (x, y, θ) or 2 (with `fixRotation`) vs. 2N for free polygon.

#### 1b. `groupRegularPolygon(n, radius, opts)`

Rigid regular n-gon. No equal-side/equal-radius constraints needed — regularity is structural.

**Why it matters**: `regularPolygon` currently emits 2(n-1) equal constraints. A group version has zero constraints and 3 DOF. For a hexagon: 10 constraints → 0, 12 DOF → 3.

**DOF**: 3 (or 2 with `fixRotation`) vs. 4 for constrained `regularPolygon`.

Note: The free `regularPolygon` retains 4 DOF (x, y, r, θ) — it can scale. A group version is rigid so it can't scale (radius is baked into local coords). This is a deliberate trade-off: if the user wants a rigid hex, they get one with less solver work. If they want a scalable one, they use the constrained version.

#### 1c. `groupCircle` — circle (center + radius) as group

A circle whose radius is fixed by construction. The solver sees 2 DOF (center x, y) instead of 3 (center x, y, radius). Useful for bolt patterns, mounting holes, etc.

**DOF**: 2 (translation only) — radius is structural.

### Tier 2: Inter-group constraints (high impact, moderate effort)

These constraints operate on **group frames**, not individual points.

#### 2a. `alignX(groupA, groupB)` / `alignY(groupA, groupB)`

Constrain two groups to share an X or Y coordinate. Reduces DOF by 1 per constraint.

**Implementation**: Single residual equation: `groupA.x - groupB.x = 0` (or `.y`). Jacobian is trivial: ±1 on the group's frame variable.

#### 2b. `groupDistance(groupA, groupB, d)`

Distance between group origins. Like `distance` but operates on frame vars directly.

#### 2c. `groupCoincident(groupA, groupB)`

Pin two group origins together (both X and Y). 2 equations.

#### 2d. `alignRotation(groupA, groupB)` / `relativeRotation(groupA, groupB, angle)`

Match or offset group rotations. Essential for patterns.

### Tier 3: Patterns (highest user impact, builds on Tiers 1–2)

This is where grouping becomes transformative for the user experience.

#### 3a. `linearPattern(source, count, spacing, direction)`

Replicate a group N times along a vector. Each copy is a clone group with inter-group distance constraints.

```ts
const hole = sk.groupCircle({ cx: 0, cy: 0, radius: 5 });
const row = sk.linearPattern(hole, { count: 4, dx: 20, dy: 0 });
// row.instances[0..3] — each is a ConstrainedGroupCircle
// Changing spacing updates all copies
```

**Solver impact**: 4 groups × 2 DOF + 3 inter-group distance constraints = 8 - 3 = 5 DOF. Without grouping: 4 circles × 3 DOF + 3 distance constraints = 12 - 3 = 9 DOF, plus each circle needs explicit radius constraints.

#### 3b. `circularPattern(source, count, centerPoint, angleSpacing)`

Replicate around a center point. Each copy's frame is rotated by `i * angleSpacing`.

```ts
const bolt = sk.groupCircle({ cx: 30, cy: 0, radius: 3 });
const pattern = sk.circularPattern(bolt, { count: 6, center: origin, angle: 60 });
```

#### 3c. `mirrorPattern(source, mirrorLine)`

Mirror a group across a line. The mirrored copy's local coords are reflected, and a symmetry constraint ties the two group frames.

### Tier 4: Quality-of-life (medium impact, low effort)

#### 4a. Partial axis locking

`fixX()` / `fixY()` on SketchGroupBuilder — lock one translation axis. Currently only `fix()` (all) and `fixRotation()` (θ only) exist.

**Implementation**: Add `fixed_x` / `fixed_y` booleans to `SketchGroup`, exclude those variables in variable extraction.

#### 4b. Intra-group constraint stripping

Per the original spec: constraints where both endpoints are in the same group should be silently dropped (they're tautologically satisfied). Currently they pass through and waste solver work.

#### 4c. Group center point

Auto-create a virtual "center" point for each group (centroid of local points). Makes it easy to constrain the group's position without knowing which vertex to target.

---

## Recommended prioritization

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | `groupPolygon` | Small | Unlocks rigid arbitrary shapes |
| **P0** | `groupRegularPolygon` | Small | Eliminates 2(n-1) constraints for rigid n-gons |
| **P1** | Inter-group frame constraints (2a–2d) | Medium | Enables relational group placement |
| **P1** | `linearPattern` | Medium | Signature CAD feature, huge UX win |
| **P2** | `circularPattern` | Medium | Common in mechanical design |
| **P2** | `mirrorPattern` | Medium | Symmetry is fundamental |
| **P2** | Partial axis locking (4a) | Small | Low-hanging fruit |
| **P3** | Intra-group constraint stripping (4b) | Small | Correctness/perf cleanup |
| **P3** | Group center point (4c) | Small | Ergonomic improvement |
| **P3** | `groupCircle` | Small | Niche but useful |

## Key insight

The current grouping implementation is **infrastructure-complete but experience-incomplete**. The rigid-body solver math is done. What's missing is the concept library and constraint vocabulary that turns "you can make groups" into "groups are the natural way to build things."

The highest-leverage work is **Tier 1 + Tier 3** — group concepts and patterns. Together they transform grouping from a power-user optimization into a first-class modeling paradigm. A user should be able to write:

```ts
const bolt = sk.groupRegularPolygon({ sides: 6, radius: 5 });
const pattern = sk.circularPattern(bolt, { count: 8, center: origin, angle: 45 });
sk.distance(pattern.instances[0].center, origin, 50); // bolt circle radius
```

...and get 8 rigid hexagons arrayed around a center, with the solver seeing ~10 DOF instead of ~100.

---

## Q: Can I group my own arbitrary build of lines?

### Current experience

**Yes, but it's manual and low-level.** The `sk.group()` API only accepts local-coordinate points and lines between them:

```ts
const g = sk.group({ x: 50, y: 30 });
const p0 = g.point(0, 0);       // local origin
const p1 = g.point(100, 0);     // 100 units right in local coords
const p2 = g.point(100, 60);    // local (100, 60)
const l0 = g.line(p0, p1);
const l1 = g.line(p1, p2);
const l2 = g.line(p2, p0);
g.fixRotation();
const handle = g.done();
```

**What works:**
- You can put any set of points+lines into a group
- The points/lines get global IDs usable in normal constraints (`sk.coincident`, `sk.distance`, etc.)
- The solver sees 3 DOF instead of 2N

**What's awkward / missing:**

1. **No arcs or circles in groups.** `SketchGroupBuilder` only has `.point()` and `.line()`. If your shape has curves, you can't group it. This is the biggest limitation — groups are polygon-only.

2. **No `.shape()` / `.addLoop()` on the group builder.** You have to call `sk.shape([...])` and `sk.addLoop([...])` manually after `.done()`. The `groupRect` concept does this for you, but custom groups don't get it for free.

3. **No center point.** You have to pick a vertex or manually add a local (0,0) point as your anchor.

4. **No "groupify existing geometry."** You can't take an already-built polygon/rect and say "make this rigid." You must rebuild it as a group from scratch with local coordinates.

5. **Local-coordinate math is on you.** You have to compute `(lx, ly)` relative to the group origin yourself. No helper to convert from world coordinates or from an existing shape's vertices.

### What "good" would look like

```ts
// Option A: group from inline points (like polygon, but rigid)
const tri = sk.groupPolygon({ points: [[0,0], [100,0], [50,80]], x: 20, y: 10 });
// Returns handle with .vertices, .sides, .shape — same as addPolygon but rigid

// Option B: group from arcs+lines (mixed profile)
const g = sk.group({ x: 50, y: 30 });
const p0 = g.point(0, 0);
const p1 = g.point(40, 0);
const a = g.arc(p0, p1, { radius: 25 });  // <-- doesn't exist yet
g.done();

// Option C: wrap existing free geometry into a group
const poly = sk.addPolygon({ points: [...] });
const rigid = sk.rigidify(poly);  // converts to group, strips structural constraints
```

---

## Q: Fusion 360 sketch shapes we don't have

### Fusion 360's Sketch > Create menu (complete)

| Tool | Sub-variants | ForgeCAD equivalent | Gap? |
|------|-------------|---------------------|------|
| **Line** | Line, 2-point line | `sk.line()`, `sk.point()` | No |
| **Rectangle** | 2-point, 3-point, center | `sk.rect()` (axis-aligned only) | **3-point rect** (rotated), **center rect** |
| **Circle** | Center-diameter, 2-point, 3-point, 2-tangent, 3-tangent | `sk.circle()` (center+radius) | **2-point**, **3-point**, **2-tangent**, **3-tangent** circle |
| **Arc** | 3-point, center-point, tangent | `sk.arcTo()`, `sk.arcByCenter()` | **Tangent arc** (auto-tangent to previous segment) |
| **Polygon** | Circumscribed, inscribed, edge | `sk.regularPolygon()` (circumscribed) | **Inscribed**, **edge-defined** polygon |
| **Ellipse** | Full ellipse, partial ellipse | — | **Entire entity type missing** |
| **Slot** | Center-to-center, overall, center-point, 3-point | — | **Entire entity type missing** |
| **Spline** | Fit-point, control-point | — | **Entire entity type missing** |
| **Conic curve** | Endpoint + rho value | — | **Entire entity type missing** |
| **Point** | Construction point | `sk.point()` | No |
| **Text** | Sketch text (for engraving) | — | **Missing** |
| **Mirror** | Mirror sketch entities over a line | `sk.symmetric()` (point-only) | **Missing for lines/shapes** |
| **Circular pattern** | Repeat entities around center | — | **Missing** |
| **Rectangular pattern** | Repeat entities in grid | — | **Missing** |
| **Project / Include** | Project 3D geometry onto sketch plane | — | **Missing** (different paradigm) |
| **Intersect** | Create points at intersections | — | **Missing** |
| **Offset** | Offset curves by distance | — | **Missing** |
| **Trim / Extend / Break** | Edit sketch curves | — | **Missing** (different paradigm — code-first) |

### Priority assessment by impact on ForgeCAD's code-first paradigm

**High value (expands what you can model):**
- **Ellipse** — needed for fillets, cam profiles, decorative geometry
- **Slot** — extremely common in mechanical design (bolt slots, adjustment slots)
- **Spline** — organic shapes, curves-of-best-fit, imported profiles
- **Offset** — shell-like operations in 2D, PCB keepout zones

**Medium value (convenience, but workaroundable):**
- **3-point / rotated rectangle** — can be done with 4 points + angle constraint, but verbose
- **Tangent arc** — `arcTo` exists but doesn't auto-compute tangent direction
- **Circular/rectangular pattern** — this is the grouping Tier 3 from the plan above
- **Mirror** — `sk.symmetric()` works for points; need it for lines/shapes

**Lower value for code-first (interactive-CAD features):**
- **Trim/extend/break** — these are mouse-driven editing operations; in code you just define the geometry you want
- **Project/Include** — ForgeCAD's sketches are standalone; 3D projection is a different workflow
- **Text** — niche (engraving/embossing), could be done via SVG import
- **Conic curve** — rare in mechanical design; splines cover most cases

### Biggest gaps summary

1. **Ellipse** — entire entity type missing from solver + builder
2. **Slot** — very common mechanical feature, no concept exists
3. **Spline** — needed for organic/freeform shapes
4. **Sketch patterns** (circular + rectangular) — Fusion's most-used layout tools, maps directly to group patterns in the plan
5. **Offset curves** — fundamental 2D operation

---

## Files referenced

| File | Role |
|------|------|
| `src/forge/sketch/constraints/builder.ts` | Builder + `SketchGroupBuilder` class |
| `src/forge/sketch/constraints/types.ts` | `SketchGroup` interface |
| `src/forge/sketch/constraints/concepts/groupRect.ts` | Only group concept today |
| `src/forge/sketch/constraints/concepts/rect.ts` | Non-group rect (comparison) |
| `src/forge/sketch/constraints/concepts/polygon.ts` | Non-group polygon (comparison) |
| `src/forge/sketch/constraints/concepts/regularPolygon.ts` | Non-group regular polygon (comparison) |
| `solver/src/types.rs` | `SketchGroup` Rust struct |
| `solver/src/solver/lm.rs` | Variable extraction, Jacobian for groups |
| `solver/src/solver/mod.rs` | `resolve_group_points()`, `compute_dof()` |

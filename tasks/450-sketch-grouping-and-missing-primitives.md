# Sketch Grouping Completion & Missing Primitives

Reference: `docs/temporary/projects/2026/03/20/grouping-saturation/PLAN.md`

## Problem Definition

The constraint solver's grouping infrastructure (rigid-body 3-DOF frames, Jacobian routing, sparsity, world-coord resolution) is complete, but the user-facing experience is thin: one high-level concept (`groupRect`), no arcs/circles in groups, no inter-group constraints, no patterns. Separately, several fundamental sketch entity types that Fusion 360 offers are entirely missing (ellipse, slot, spline, offset).

This task covers both axes: completing the grouping experience and filling the primitive gaps.

## Phase 1 — Group concept library

Extend the concepts directory with group equivalents of existing non-group shapes. Each concept follows the `groupRect` pattern: create a group, add local-coord points/lines, register shape+loop, return a typed handle.

### 1a. `groupPolygon(sk, { points, x?, y?, allowRotation? })`

- Accept world-coord points array, convert to local coords relative to centroid (or first point)
- Create group, add points+lines, register shape+loop
- Return `ConstrainedGroupPolygon` with `.vertices`, `.sides`, `.shape`, `.point(i)`, `.side(i)`
- No structural constraints needed (rigidity is by construction)
- DOF: 3 (or 2 with fixRotation) vs 2N for free polygon

### 1b. `groupRegularPolygon(sk, { sides, radius, cx?, cy?, startAngle?, allowRotation? })`

- Compute vertex coords, convert to local, create group
- Return `ConstrainedGroupRegularPolygon` with `.center` (local origin point), `.vertices`, `.sides`, `.shape`
- Zero constraints vs 2(n-1) equal constraints for free `regularPolygon`
- DOF: 3 vs 4 (loses scaling DOF — deliberate trade-off)

### 1c. Arcs in groups (solver extension)

- Add `arc(center, start, end, opts)` to `SketchGroupBuilder`
- Store arc local coords in `SketchGroup` (new `arcs` field)
- Rust: resolve group arc world coords in `resolve_group_points()`
- This unblocks curved rigid shapes (rounded rects, cam profiles)

### Testing — Phase 1

- Each concept: test that DOF count matches expected (3 or 2)
- Test that group points participate in external constraints (coincident, distance)
- Test that `fixRotation` reduces DOF by 1, `fix` reduces to 0
- Test solve convergence: 10-point groupPolygon + 3 external constraints solves in same iterations as 3-DOF point system
- Test arc-in-group: arc world coords update correctly after solver moves group frame
- Negative: passing a group-owned point to `sk.fix()` must throw

## Phase 2 — Inter-group constraints

New constraint types that operate on group frame variables directly. These go in the Rust solver as new constraint types and in the TS builder as new methods.

### 2a. `alignX(groupA, groupB)` / `alignY(groupA, groupB)`

- 1 residual equation: `gA.x - gB.x` (or `.y`)
- Analytical Jacobian: ±1 on group frame vars (no FD needed)

### 2b. `groupDistance(groupA, groupB, value)`

- Distance between group origins
- Residual: `sqrt((gA.x - gB.x)² + (gA.y - gB.y)²) - value`

### 2c. `groupCoincident(groupA, groupB)`

- 2 equations: `gA.x - gB.x`, `gA.y - gB.y`

### 2d. `alignRotation(groupA, groupB)` / `relativeRotation(groupA, groupB, angle)`

- 1 equation: `gA.θ - gB.θ` (or `- angle`)

### Testing — Phase 2

- Each constraint: test residual is zero when satisfied, nonzero when violated
- Test DOF reduction: 2 free groups (6 DOF) + alignX = 5 DOF
- Test solver convergence with chains: 3 groups linked by groupDistance constraints
- Test mixed: group-level + point-level constraints on same group
- Negative: applying inter-group constraint to non-group entity must throw

## Phase 3 — Patterns

High-level concepts that clone groups and add inter-group constraints. Built on Phase 1 + Phase 2.

### 3a. `linearPattern(source, { count, dx, dy })`

- Clone source group N-1 times (same local geometry, offset initial position)
- Add `hDistance` / `vDistance` constraints between consecutive group origins
- Return `{ instances: [...handles], spacing: constraintIds }`
- DOF: source DOF + (count-1) if spacing is constrained, more if not

### 3b. `circularPattern(source, { count, center, angle? })`

- Clone source group, position each at `center + r * [cos(i*θ), sin(i*θ)]`
- Add distance-to-center + relativeRotation constraints
- Return `{ instances: [...handles], center }`

### 3c. `mirror(source, mirrorLine)`

- Create one clone with reflected local coordinates
- Add symmetric constraint between corresponding group points (or group frame constraint)
- Return `{ original, mirrored }`

### Testing — Phase 3

- linearPattern: 4 instances, verify spacing constraints, test that changing dx/dy moves all copies
- circularPattern: 6 instances around center, verify equal angular spacing and equal radius
- mirror: verify reflected geometry is geometrically correct, test that moving original moves mirror
- DOF tests: pattern of N groups with all pattern constraints = expected DOF
- Performance: 20-instance linear pattern solves within 50ms (groups keep DOF low)
- Edge cases: count=1 (no clones), count=2 (single pair)

## Phase 4 — Missing sketch primitives

New entity types in the Rust solver and TS builder. Each requires: type definition, residual functions for constraints, serialization, and builder API.

### 4a. Ellipse

- Entity: center (x,y), semi-major a, semi-minor b, rotation angle
- Solver variables: cx, cy, a, b, angle (5 DOF unfixed)
- Constraints needed: `pointOnEllipse`, `ellipseTangent`, `ellipseRadius` (major/minor)
- Builder: `sk.ellipse(cx, cy, a, b, angle?)`

### 4b. Slot

- Concept (not a new entity type): 2 semicircular arcs + 2 tangent lines
- Builder: `sk.slot({ center1, center2, width })` — emits arcs+lines+tangent constraints
- Variants: center-to-center, overall length
- Returns handle with `.center1`, `.center2`, `.top`, `.bottom`, `.arc1`, `.arc2`

### 4c. Spline (fit-point)

- Entity: ordered control/fit points, degree
- Solver variables: each fit point is (x, y) — 2N DOF
- Constraints: `pointOnSpline`, `splineTangent` at endpoints
- Builder: `sk.spline([p1, p2, p3, ...])` — creates fit-point B-spline through given points
- Rendering: evaluate spline for polyline approximation

### 4d. Offset curves

- Not a new entity type — a concept that creates parallel geometry
- `sk.offset(sourceLines, distance)` — creates offset copies of lines/arcs with `lineDistance`/`concentric` constraints
- Returns handle with offset entity IDs

### Testing — Phase 4

- Ellipse: point-on-ellipse residual correct for known points, tangent constraint works, solver converges for ellipse + 3 fix constraints
- Slot: verify slot geometry is tangent-continuous, test length/width dimension constraints
- Spline: fit points lie on curve, tangent direction at endpoints matches constraint, spline with 5 points + 2 fixed endpoints converges
- Offset: offset lines maintain constant distance, offset arcs maintain constant radial offset
- Degenerate cases: zero-radius ellipse, zero-width slot, 2-point spline (= line), zero offset distance
- Integration: ellipse inside a group, slot with pattern, spline endpoints coincident with other geometry

## Phase 5 — Quality-of-life & cleanup

### 5a. Partial axis locking

- `fixX()` / `fixY()` on `SketchGroupBuilder`
- Add `fixed_x`, `fixed_y` booleans to `SketchGroup` (Rust + TS)
- Exclude locked axis from variable extraction in LM solver

### 5b. Intra-group constraint stripping

- In solver, detect constraints where all referenced entities belong to the same group
- Strip them before solve (they're tautologically satisfied)
- Emit a warning if the user explicitly added one

### 5c. Group center point

- Auto-create a virtual center point at centroid of local points
- Expose as `.center` on `SketchGroupHandle`
- Center participates in constraints like any point

### 5d. Mirror for shapes (not just points)

- `sk.mirrorShape(entities, mirrorLine)` — mirrors a set of lines/arcs over a line
- Creates mirrored copies with symmetric constraints

### 5e. Additional circle creation modes

- `sk.circleBy2Points(p1, p2)` — diameter defined by 2 points
- `sk.circleBy3Points(p1, p2, p3)` — circle through 3 points
- These are concepts that create a circle + coincident constraints

### 5f. 3-point / rotated rectangle

- `sk.rect3Point(p1, p2, p3)` — first 2 points define one edge (sets angle), third defines height
- Concept: 4 points + parallel + equal-opposite-sides + angle constraint

### Testing — Phase 5

- Axis locking: `fixX` on group leaves 1 DOF (Y translation) if rotation also fixed
- Intra-group stripping: constraint count sent to solver is reduced, solve result unchanged
- Center point: coincident constraint on center moves entire group
- Mirror: mirrored shape is geometrically reflected, constraints bind original to mirror
- Circle modes: 3-point circle passes through all 3 points after solve
- 3-point rect: rectangle angle matches p1→p2 direction

## Acceptance Criteria

- All new concepts have typed handles matching the pattern of existing concepts (named accessors, `.shape`, `.vertices`, `.sides`)
- `forgecad check constraints` passes with all new test cases
- DOF counts are correct for every new concept and constraint combination
- No regressions in existing solver tests
- Each phase can be merged independently — no cross-phase dependencies except where noted (Phase 3 depends on Phase 2)

## Status and log

- 2026-03-20: Created from grouping saturation investigation.

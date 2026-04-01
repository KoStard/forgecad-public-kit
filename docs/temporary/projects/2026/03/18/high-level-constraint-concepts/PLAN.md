# High-Level Constraint Concepts

**Date:** 2026-03-18
**Branch:** worktree-high-level-constraint-concepts
**Goal:** Add first-class shape concepts (`rect`, `polygon`, `regularPolygon`) to the constraint solver that return typed handles giving named access to internals (vertices, sides, center, shape), with canonical CCW winding and Fusion-360-style ergonomics.

---

## Goal & Current State

**Problem:** Using the constraint solver requires building rectangles and polygons manually — creating individual points, lines, applying structural constraints by hand. No canonical conventions for vertex ordering or side naming exist at the constraint level. A rectangle takes ~15 lines of setup code.

**Desired:** `sk.rect({ x: 0, y: 0, width: 100, height: 50 })` returns a `ConstrainedRect` with named access: `rect.bottomLeft`, `rect.top`, `rect.center`. Further constraints apply naturally: `sk.length(rect.bottom, 200)`.

**Baseline:** 0 high-level concept types exist at the constraint level. `Rectangle2D` in `entities.ts` is a pure geometry object, not a constraint-system object. The builder has `importRectangle()` but it applies zero structural constraints and returns anonymous IDs.

---

## Architecture Summary

### Existing Foundation

- `ConstrainedSketchBuilder` (`builder.ts`): stateful builder, all entity creation and constraint application goes through it. Methods are chainable. Structural incremental solving happens on every `constrain()` call.
- `entities.ts`: `Rectangle2D`, `Point2D`, `Line2D`, `Circle2D` — pure geometry objects, no constraint system integration.
- `builder.importRectangle()`: imports a `Rectangle2D`'s 4 corners as free points + 4 lines, returns `{ bottom, right, top, left, points }` — no structural constraints applied.
- Constraint types used: `horizontal`, `vertical`, `perpendicular`, `parallel`, `equal`, `equalRadius`, `ccw`, `shape`.

### New Layer: Concepts

New file: `src/forge/sketch/concepts.ts`

Factory functions that operate on a `ConstrainedSketchBuilder`, create geometry + apply structural constraints, and return typed handle objects.

**Convention rules (canonical, non-negotiable):**

| Rule | Value |
|------|-------|
| Winding | **CCW** (counter-clockwise), standard mathematical orientation |
| Rectangle vertex order | bottomLeft → bottomRight → topRight → topLeft |
| Polygon vertex index 0 | First input point |
| RegularPolygon vertex 0 | At `startAngle` (default 0 = rightmost, +X axis) |
| Side index i | From `vertices[i]` → `vertices[(i+1) % n]` |
| Rectangle side names | `bottom` (bl→br), `right` (br→tr), `top` (tr→tl), `left` (tl→bl) |

---

## Shape Concepts

### 1. `addRect` — axis-aligned rectangle

**Structural constraints applied:**
- `horizontal(bottom)`, `horizontal(top)` — horizontal sides
- `vertical(left)`, `vertical(right)` — vertical sides
- 4 independent constraints → leaves 4 DOF (x, y, width, height)

**Returns `ConstrainedRect`:**
```typescript
{
  // Named vertices (PointId)
  bottomLeft, bottomRight, topRight, topLeft: PointId
  // Named sides (LineId) — direction follows CCW traversal
  bottom, right, top, left: LineId
  // Convenience center point (PointId)
  center: PointId
  // ShapeId for shape constraints (shapeWidth, shapeArea, etc.)
  shape: ShapeId
  // Ordered arrays
  vertices: [PointId, PointId, PointId, PointId]  // CCW
  sides: [LineId, LineId, LineId, LineId]          // CCW
  // Named access helpers
  vertex(name): PointId
  side(name): LineId
}
```

### 2. `addPolygon` — general polygon (CCW enforced)

**Structural constraints applied:**
- `ccw(...vertices)` — enforce CCW winding

**Returns `ConstrainedPolygon`:**
```typescript
{
  vertices: PointId[]      // in CCW input order
  sides: LineId[]          // sides[i]: vertices[i] → vertices[(i+1) % n]
  shape: ShapeId
  vertex(index: number): PointId
  side(index: number): LineId
}
```

### 3. `addRegularPolygon` — regular n-gon

**Structural constraints applied:**
- `equal` constraints on all sides (all sides equal length)
- `ccw(...vertices)` — CCW winding
- Optionally: fix `center` if provided

**Returns `ConstrainedRegularPolygon extends ConstrainedPolygon`:**
```typescript
{
  ...ConstrainedPolygon
  center: PointId
  // vertex(0) is at startAngle (default 0 = rightmost)
}
```

---

## Progress Tracker

| # | Change | Description | Status |
|---|--------|-------------|--------|
| — | Baseline | Manual rectangle creation, no concept API | ✅ |
| C1 | `ConstrainedRect` type | Type definition for rect handle | ✅ |
| C2 | `addRect()` | Factory + structural constraints | ✅ |
| C3 | `ConstrainedPolygon` type | Type + CCW enforcement | ✅ |
| C4 | `addPolygon()` | Factory implementation | ✅ |
| C5 | `ConstrainedRegularPolygon` | Type + equal-radius + equal-side constraints | ✅ |
| C6 | `addRegularPolygon()` | Factory implementation | ✅ |
| C7 | Builder integration | Convenience methods `sk.rect()`, `sk.addPolygon()`, `sk.regularPolygon()` | ✅ |
| C8 | Public exports | Added to `sketch/index.ts` | ✅ |
| T1 | Tests | 10 unit tests — 10/10 pass (53 total in suite) | ✅ |

---

## Experiment Log

### Design Decision: Where do the center point of `addRect` live?

**Options:**
1. Compute and add an unconstrained center point (midpoint of diagonal)
2. Add center as a construction point with midpoint constraints
3. Don't add center — compute it lazily from corners

**Decision:** Option 2 — add center as a real point constrained by two `midpoint` constraints (center is midpoint of diagonal). This makes it usable in further constraints (e.g., `sk.coincident(rect.center, circle.center)`) and the solver will keep it correct.

**Why not option 3:** If the user does `sk.fix(rect.center, 0, 0)`, they need a real PointId.

### Design Decision: Should `addRect` create a ShapeId?

**Decision:** Yes. The `shape` handle enables `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y` constraints. These are the dimension constraints that make rectangles actually useful in the solver. Cost: 1 shape registration call.

### Design Decision: `addRegularPolygon` — constrain center or leave free?

**Decision:** Add center as a real point. For regular n-gon, all vertices equidistant from center → add `distance(center, vertex[i], radius)` for all i. This fully structurally constrains the shape (n DOF removed: radius + equal distances). User can then fix center or radius as needed.

But this is n+1 constraints for n vertices. This might over-constrain. Let's think:
- n-gon: 2n point vars
- Regular n-gon has 4 DOF: cx, cy, radius, rotation
- Structural constraints: n `distance(center, vertex_i, radius)` equations... but `radius` is shared via `equal` constraints, not direct distance
- Better: `equal` on all sides (n-1 constraints) + `ccw` (0 equations, just winding orientation)
- Leave radius unconstrained — user adds `sk.length(poly.side(0), R)` themselves
- Leave center unconstrained — user adds `sk.fix(poly.center, 0, 0)` themselves

Actually for full structural regularity:
- `equal(side[0], side[1]), equal(side[1], side[2]), ..., equal(side[n-2], side[n-1])` = n-1 constraints
- `ccw(...)` = orientation (no equations in LM solver — purely a hint)
- Equal interior angles: implied by equal sides for convex polygon? No — regular polygon has equal sides AND equal angles. We need both.
- Actually for a polygon inscribed in a circle: n distances from center = n constraints → fully structural

**Final decision for `addRegularPolygon`:** Two sets of n-1 `equal` constraints:
1. `equal` on construction lines from center to each vertex (all vertices equidistant from center = circumscribed circle)
2. `equal` on sides (all sides equal length = equal chord lengths)

Combined: 2(n-1) constraints, DOF = 2n+2 - 2(n-1) = 4. Exactly right. This uniquely defines a regular n-gon up to translation, scale, rotation.

Tested: all 10 concept tests pass with this approach.

---

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/concepts.ts` | New — concept factories and handle types |
| `src/forge/sketch/constraints/builder.ts` | Add convenience methods `rect()`, `polygon()`, `regularPolygon()` |
| `src/forge/sketch/index.ts` | Export new types and functions |

---

## Notes

- All concepts enforce CCW winding. This matches Manifold/CrossSection's required orientation.
- The `center` point in `addRect` uses `midpoint` constraints against the diagonal, making it a solver-tracked entity that stays at the geometric center as the rectangle deforms.
- `addRegularPolygon` is "practically regular" (equal sides via `equal` constraints). True geometric regularity (equal angles too) requires additional `angleBetween` constraints — omitted to avoid over-constraining simple use cases.

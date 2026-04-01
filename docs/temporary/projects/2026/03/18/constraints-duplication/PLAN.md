# Constrained Sketch: Shape Duplication & Higher-Level Abstractions

## Goal & Current State

**Goal**: Design and implement a mechanism for duplicating/cloning/mirroring constrained shapes (like rectangles) in a constrained sketch, so users don't have to manually re-create identical geometry with all its constraints.

**Motivation**: When building real designs (e.g., a box with top/bottom surfaces, mirrored side panels), users need multiple copies of the same constrained shape. Currently, each copy requires manually creating a new `sk.rect()`, re-applying all dimensional constraints, and wiring up positional relationships. This is tedious and error-prone.

**Example** (from user's box design):
```js
// Need 2x side surfaces (left + right), 2x front surfaces (front + back),
// and the top surface duplicated for the bottom.
// Currently must manually create each one and re-apply all constraints.
const topSideSurface = sk.rect();
sk.length(topSideSurface.top, topSideSurfaceHeight);
sk.length(topSideSurface.left, topSideSurfaceLength);
// ... then do this again for bottomSideSurface with identical dimensions
```

**Current State**: The constrained sketch system has:
- **Concepts** (`rect`, `polygon`, `regularPolygon`) that create geometry + structural constraints and return typed handles
- **Per-point `symmetric` constraint** — mirrors individual points across an axis (2 equations per point pair)
- **`equal` constraint** — forces two lines to have equal length
- **No compound duplication** — no way to clone a concept (rect, polygon) with all its constraints
- **No grouping** — entities are flat lists with string IDs; no parent/child or group relationships

## Architecture Summary

### How Concepts Work

Concepts (in `src/forge/sketch/constraints/concepts/`) are factory functions that:
1. Create points and lines on the builder
2. Apply structural constraints (e.g., horizontal/vertical for rect)
3. Register loops and shapes
4. Return a typed handle (e.g., `ConstrainedRect` with `.top`, `.left`, `.center`, etc.)

Key: concepts are **creation-time abstractions only**. Once created, the builder only sees flat points/lines/constraints. The handle is just a convenience object with IDs.

### Data Model

```
ConstrainedSketchBuilder
  ├── points: SketchPoint[]       (id, x, y, fixed)
  ├── lines: SketchLine[]         (id, a: PointId, b: PointId)
  ├── circles: SketchCircle[]
  ├── arcs: SketchArc[]
  ├── shapes: SketchShape[]       (id, lines: LineId[])
  ├── loops: SketchLoop[]
  └── constraints: SketchConstraint[]  (type, params referencing entity IDs)
```

All entities are identified by string IDs. Constraints reference entity IDs. No hierarchy.

### Existing Relevant Primitives

| Primitive | What it does | Granularity |
|-----------|-------------|-------------|
| `symmetric(a, b, axis)` | Mirror point `a` to `b` across line `axis` | Per-point (2 equations) |
| `equal(line1, line2)` | Force equal length | Per-line |
| `lineDistance(a, b, dist)` | Parallel offset between lines | Per-line |
| `coincident(a, b)` | Two points at same location | Per-point |

---

## Design Options

### Option A: `sk.clone(concept)` — Concept-Level Copy

Create a new instance of the same concept type with **equal-dimension constraints** linking back to the original.

```js
const topSide = sk.rect();
sk.length(topSide.top, sideHeight);
sk.length(topSide.left, sideLength);

const bottomSide = sk.clone(topSide); // new rect, sk.equal on all sides
// bottomSide.top length is constrained equal to topSide.top
// bottomSide.left length is constrained equal to topSide.left
// Position is free (4 DOF: x, y remain)
```

**Pros**: Simple API, obvious semantics, easy to implement.
**Cons**: Only duplicates structural shape, not user-applied constraints (length, distance, etc.). "Clone" might imply full constraint copying which isn't what happens.

### Option B: `sk.mirror(concept, axis)` — Geometric Mirror

Create a mirrored copy where each vertex is `symmetric` to the original across an axis line.

```js
const topSide = sk.rect();
sk.length(topSide.top, sideHeight);
sk.length(topSide.left, sideLength);

const centerLine = sk.line(sk.point(0, 0), sk.point(0, 100), true); // construction
const bottomSide = sk.mirror(topSide, centerLine);
// Each vertex of bottomSide is symmetric to corresponding vertex in topSide
// Dimensions are implicitly equal (symmetric forces it)
// 0 additional DOF — fully determined by original + axis
```

**Pros**: Geometrically correct mirroring, no extra dimension constraints needed, matches CAD conventions.
**Cons**: Only works for mirror (not general duplication), adds many constraints (2 per vertex = 8 for a rect), the mirrored shape is fully constrained to the original (can't have different position).

### Option C: `sk.duplicate(concept, constraints?)` — Copy with Constraint Selection

Duplicate the concept and selectively apply constraints linking to the original.

```js
const topSide = sk.rect();
sk.length(topSide.top, sideHeight);

const bottomSide = sk.duplicate(topSide, {
  equalSides: true,    // sk.equal on all corresponding sides
  mirror: centerLine,  // symmetric vertices across axis
  offset: [0, -100],   // initial position offset
});
```

**Pros**: Flexible, covers multiple use cases.
**Cons**: Complex API, options combinatorics, hard to discover.

### Option D: Concept Factories with Shared Parameters — Pure JS Approach

Instead of a solver-level primitive, provide patterns for reuse at the JS level:

```js
function sidePanel(sk, height, length) {
  const r = sk.rect();
  sk.length(r.top, height);
  sk.length(r.left, length);
  return r;
}

const leftSide = sidePanel(sk, sideHeight, sideLength);
const rightSide = sidePanel(sk, sideHeight, sideLength);
// Same param() values mean same dimensions, but not solver-linked
```

**Pros**: No new API needed, users already have this pattern available.
**Cons**: Dimensions aren't solver-linked (changing one doesn't change the other unless both use the same `param()`). This is what the user already has — doesn't add new capability.

### Option E: `sk.equalShape(a, b)` — Shape Equality Constraint

Rather than duplicating, let the user create shapes independently and then constrain them equal:

```js
const topSide = sk.rect();
const bottomSide = sk.rect();
sk.equalShape(topSide, bottomSide); // all corresponding sides forced equal
// Position remains independent
```

**Pros**: Orthogonal to creation (constrain after the fact), simple mental model.
**Cons**: Requires matching semantics (what does "corresponding" mean for arbitrary polygons?). Works naturally for same-type concepts but gets ambiguous for different shapes.

---

## Recommendation

**Implement Options A + B + E as complementary features**, with a phased approach:

### Phase 1: `sk.equalShape(rectA, rectB)` — Shape Equality (Option E)

Simplest to implement, most orthogonal. For `ConstrainedRect` specifically:
- `sk.equal(a.top, b.top)`, `sk.equal(a.right, b.right)`, etc.
- Could generalize to `ConstrainedPolygon` by matching sides by index.

This alone solves the user's box problem:
```js
const topSide = sk.rect();
sk.length(topSide.top, sideHeight);
sk.length(topSide.left, sideLength);

const bottomSide = sk.rect();
sk.equalShape(topSide, bottomSide); // same dimensions, free position
attachAtMidpoint(topSurface.bottom, bottomSide.left);
```

### Phase 2: `sk.mirror(concept, axis)` — Geometric Mirror (Option B)

Creates a new concept instance with symmetric constraints on all vertices. For the box:
```js
const centerH = sk.line(..., true); // horizontal construction line
const bottomSide = sk.mirror(topSide, centerH);
// Fully determined by topSide + axis
```

### Phase 3: `sk.clone(concept)` — Quick Copy (Option A)

Convenience that creates + applies equalShape in one call:
```js
const bottomSide = sk.clone(topSide); // = sk.rect() + sk.equalShape(topSide, bottomSide)
```

---

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline: no duplication support | Current state |
| P1 | Design analysis & option exploration | ✅ Complete |
| S1 | Subproject: argument validation for builder methods | ✅ Complete |
| P2 | Implement `equalShape` for rects | Planned |
| P3 | Implement `mirror` for concepts | Planned |
| P4 | Implement `clone` convenience | Planned |

---

## Experiment Log

#### P1: Design Analysis (COMPLETE)

**What**: Analyzed the constrained sketch architecture, existing primitives, and possible approaches for shape duplication.

**Key findings**:
1. Concepts are creation-time-only abstractions — the solver sees flat entities
2. `symmetric` already exists per-point, so `mirror` can be built on top of it
3. `equal` already exists per-line, so `equalShape` can be built on top of it
4. No new solver primitives needed — all options compose existing constraints
5. The typed handles (`ConstrainedRect`, `ConstrainedPolygon`) provide the structure needed to know which entities correspond

**The user's real need**: Multiple shapes with identical dimensions, positioned independently. This is `equalShape` + positioning constraints. Mirror is a useful special case where position is derived from the original.

---

#### S1: Argument Validation for Builder Methods (COMPLETE)

**What**: Added runtime validation to all `ConstrainedSketchBuilder` methods to catch wrong argument types early instead of silently failing.

**Changes**:
1. **Entity existence checks in `resolve*` methods** — `resolvePointId`, `resolveLineId`, `resolveCircleId`, `resolveArcId`, `resolveShapeId` now verify that the ID exists in the builder's entity lists. Error messages include the invalid ID and list available entities.
2. **Numeric validation** — All 17 dimension constraint methods (`length`, `distance`, `radius`, `angle`, etc.) and `fix()` now call `requireFinite()` to reject `NaN`, `Infinity`, `undefined`, and non-number values.
3. **`pointOnLine` fixed** — Was the only constraint method not using `resolve*` helpers; now uses `resolvePointId` + `resolveLineId`.
4. **Entity creation validation** — `point()` validates finite coordinates, `line()` validates endpoint IDs exist, `circle()` validates finite radius and center point exists.

**Why this matters**: Previously, passing a `LineId` where a `PointId` was expected would compile fine (both are `string`), and at runtime the constraint's `residual()` function would silently return `[0]` (meaning "satisfied") because the entity lookup returned `undefined`. The user would see a successful solve with the constraint doing nothing.

**Result**: Wrong types now throw immediately with a clear error message like:
```
Point "ln-5" not found in sketch. Available points: pt-1, pt-2, pt-3, pt-4
```

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/constraints/builder.ts` | All validation changes — resolve methods, requireFinite, entity creation |

## Implementation Notes

### `equalShape` for `ConstrainedRect`

Could be a concept-level function or a builder method:

```ts
// In concepts/equalShape.ts
export function equalRects(
  sk: ConstrainedSketchBuilder,
  a: ConstrainedRect,
  b: ConstrainedRect,
): void {
  // Force all 4 corresponding sides to equal length
  sk.equal(a.bottom, b.bottom);
  sk.equal(a.right, b.right);
  sk.equal(a.top, b.top);
  sk.equal(a.left, b.left);
}
```

### `mirror` for `ConstrainedRect`

```ts
export function mirrorRect(
  sk: ConstrainedSketchBuilder,
  source: ConstrainedRect,
  axis: LineId,
): ConstrainedRect {
  // Create a new rect with same initial dimensions
  const mirrored = addRect(sk, { /* reflected initial coords */ });

  // Symmetric constraints on all 4 vertex pairs
  sk.symmetric(source.bottomLeft, mirrored.bottomRight, axis); // note: mirror flips
  sk.symmetric(source.bottomRight, mirrored.bottomLeft, axis);
  sk.symmetric(source.topRight, mirrored.topLeft, axis);
  sk.symmetric(source.topLeft, mirrored.topRight, axis);

  return mirrored;
}
```

### Generalization Path

Both `equalShape` and `mirror` should work on `ConstrainedPolygon` (by index), not just `ConstrainedRect`. Since `ConstrainedRect` extends the concept pattern, the implementation can use the `vertices` and `sides` arrays that all concept handles expose.

```ts
// Generic version
function equalPolygons(sk, a: ConstrainedPolygon, b: ConstrainedPolygon) {
  if (a.sides.length !== b.sides.length) throw new Error('Side count mismatch');
  for (let i = 0; i < a.sides.length; i++) {
    sk.equal(a.sides[i], b.sides[i]);
  }
}
```

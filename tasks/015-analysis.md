# Task 015 — Refactor Toward Ideal CAD API

## What the Ideal API Leads To

The ideal-cad-api.md describes a fundamental shift in how users think about CAD modeling. Right now, ForgeCAD is essentially "Three.js with extra steps" — you place boxes at coordinates, subtract cylinders at coordinates, everything is manual positioning. The ideal API moves toward what Fusion 360 and SolidWorks actually do: **you describe relationships, and the system figures out positions**.

The laptop example is the clearest illustration:
```javascript
top.rotateAround(top.getEdge("width1"), degrees(120));
```

This is not "rotate 120° around the Z axis at position (x, y, z)". It's "rotate around *this specific edge of this specific object*". The geometry knows its own topology. That's the core shift.

### Three Layers of Abstraction

The ideal API describes three distinct layers that don't exist yet:

1. **Named Geometric Entities** — `Line`, `Point`, `Rectangle` as first-class objects with identity, not just coordinate tuples
2. **Constraint System** — `Constraint.makeParallel()`, `Constraint.enforceAngle()` — relationships between entities that the solver resolves
3. **Topological References** — `object.getEdge("width1")`, `object.getSurface("bottom")` — the ability to refer to parts of a 3D object by semantic name

### What Already Exists

The constraint solver in `constraints.ts` is substantial (~900 lines). It has:
- 14+ constraint types (coincident, parallel, perpendicular, distance, angle, etc.)
- An iterative relaxation solver
- Point, Line, Circle entities with IDs
- Conflict detection
- A `ConstrainedSketchBuilder` fluent API

But it's disconnected from the main API. The user-facing primitives (`rect()`, `circle2d()`, etc.) create raw `Sketch` objects with no entity awareness. The constraint system lives in a parallel universe.

### What's Missing

| Gap | Current State | Ideal State |
|-----|--------------|-------------|
| Named entities | `rect(50, 30)` returns anonymous Sketch | `Rectangle.from2Coordinates(p1, p2)` returns entity with named sides |
| Topology on 3D | `shape.translate(x,y,z)` — no edge/face access | `shape.getEdge("width1")`, `shape.getSurface("bottom")` |
| Constraint-first workflow | Constraints are opt-in via `constrainedSketch()` | Constraints are the default way to position things |
| Algorithm catalog | Only boolean ops | `ArcFiller.betweenTwoAreas()`, fillets, chamfers as first-class |
| Entity identity across re-renders | No identity tracking | Stable IDs based on construction history |

## Key Questions / Open Problems

### 1. Identity Stability
The ideal API mentions `rectangle.chooseSide(2)` and `area.chooseArea(1)`. The question is: how do we keep these indices stable when the user modifies parameters?

**Proposed approach**: Build identity from construction history, not from geometric position. A rectangle created from `Rectangle.from2Coordinates(p1, p2)` always has sides named `side-0` through `side-3`, starting from p1 going clockwise. The index is deterministic from the construction, not from the final geometry.

### 2. Constraint Solver Scope
The current solver is a simple iterative relaxation. For the ideal API to work well, we need it to handle:
- Over-determined systems (reject gracefully)
- Under-determined systems (show degrees of freedom)
- Real-time feedback on constraint status

The existing solver already does basic versions of all three. The main gap is integration with the entity layer.

### 3. 3D Topological References
`object.getEdge("width1_extrusion")` requires tracking which 2D edges became which 3D edges during extrusion. This is the hardest problem. Manifold WASM doesn't expose topology — it's a mesh kernel, not a B-rep kernel.

**Proposed approach for now**: For extruded shapes, we can synthetically track topology. An extruded rectangle has known faces: top, bottom, and 4 sides named after the sketch edges. This works for extrusion/revolution but not for arbitrary boolean results.

### 4. ArcFiller and Algorithm Catalog
`ArcFiller.betweenTwoAreas()` is essentially a loft/blend operation. Manifold doesn't have native loft. We'd need to:
- Approximate with interpolated cross-sections
- Or use a different kernel for this specific operation

**Proposed approach**: Start with a simple linear interpolation between two faces, subdivided into steps. Not as smooth as Fusion 360's fillet, but functional.

## Refactoring Plan

### Phase 1: Named 2D Entities (this PR)
Add `Point`, `Line`, `Rectangle` as first-class objects that:
- Have stable identity
- Know their constituent parts (sides, vertices)
- Can be used with the constraint system
- Still produce `Sketch` objects for rendering/extrusion

✅ DONE

### Phase 2: Constraint Integration
Make constraints work naturally with the entity layer:
- `Constraint.makeParallel(rect.side(2), line)` 
- Constraints auto-solve when building the sketch
- Visual feedback in the viewport

✅ DONE — Constraint namespace accepts Point2D/Line2D directly, ConstrainedSketchBuilder has importPoint/importLine/importRectangle

### Phase 3: 3D Topology Tracking
Add topology awareness to extruded shapes:
- Track which sketch edges become which 3D faces
- `shape.getSurface("side-0")` returns a face reference
- `shape.getEdge("top-side-0")` returns an edge reference

✅ DONE — Proper axis-angle rotation via Rodrigues formula, Circle2D with extrusion topology, Shape.transform() exposed

### Phase 4: Algorithm Catalog
- `ArcFiller` / loft between faces
- Fillet/chamfer on edges (approximate via mesh operations)
- Pattern operations (linear, circular, mirror)

✅ DONE (partial) — linearPattern, circularPattern, mirrorCopy, filletEdge, chamferEdge. ArcFiller deferred (needs loft/sweep which Manifold doesn't support natively).

## Cool Improvements Beyond the Ideal API

### 1. Implicit Constraints from Construction
When you write `Rectangle.from2Coordinates(p1, p2)`, the system should automatically add horizontal/vertical constraints on the sides. The user shouldn't need to manually constrain what's already implied by the construction method.

### 2. Relative Positioning via Anchors (already exists!)
The `attachTo()` system is actually a step toward constraint-based positioning. It could be extended: instead of just snapping anchors, it could create actual constraints that the solver maintains.

### 3. Smart Defaults for `chooseSide` / `getEdge`
Instead of numeric indices, use semantic names derived from construction:
- `rect.side('top')`, `rect.side('left')` — based on orientation at construction time
- `extrudedShape.face('top')`, `extrudedShape.face('front')` — based on extrusion direction

### 4. Construction History as First-Class Data
Every shape remembers how it was built. This enables:
- Undo/redo at the operation level
- Parametric replay (change a parameter, replay all operations)
- Better error messages ("the hole you're subtracting doesn't intersect the base")

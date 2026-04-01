# 2D Sketch Pipeline: Manifold ↔ ProfileCompilePlan ↔ OCCT

Captured from implementing sketch region selection, planar arrangement detection, and cross-sketch reference geometry (2026-03).

---

## The Two-Track Export Model

Every 3D shape in ForgeCAD has two representations:

1. **Manifold mesh** — a watertight triangulated solid used for preview rendering and boolean operations.
2. **`ProfileCompilePlan`** — a serializable "intent" description (discriminated union with `kind: 'rect' | 'circle' | 'polygon' | 'boolean' | ...`) that the CadQuery/OCCT BRep compiler reads to produce exact geometry for STEP export.

When exporting STEP, the system walks the `ProfileCompilePlan` tree. If a node has no plan (plan is `null`), it falls back to a faceted mesh-to-STEP conversion — exact for machining, but loses parametric intent.

**Key invariant**: any sketch API that only calls `polygon()` and boolean ops (`add`/`subtract`) automatically gets exact STEP export. No special OCCT-specific code is needed.

---

## What `Sketch` Is

`Sketch` wraps a Manifold `CrossSection` (2D polygon set). It also carries:
- An optional `ProfileCompilePlan` for the STEP path.
- A `Placement3D` for face-mounted sketches (`.onFace()`).

`ConstrainedSketchBuilder` → `.solve()` → `ConstraintSketch extends Sketch` holds the constraint definition alongside the solved `CrossSection`. The solved `CrossSection` is built from explicitly declared loops (`addLoop`); geometry outside loops is not included in the area — only in the constraint definition for arrangement detection.

---

## New 2D Sketch Surface-Selection APIs (2026-03)

### 1. `sketch.regions()` / `sketch.region(seed)`

**File**: `src/forge/sketch/regions.ts`

Decomposes a Manifold `CrossSection` into its distinct filled areas.

- `CrossSection.toPolygons()` returns a flat list of contours. Positive signed area → outer boundary; negative → hole.
- Holes are nested into their smallest containing outer boundary via `pointInPolygon`.
- Each outer boundary + its holes is reassembled as a `polygon(outerPts, holePts)` sketch.
- The `region(seed)` variant picks the one face whose outer boundary contains the seed and no hole does.

**STEP export**: uses `polygon()` and potentially `boolean(difference)` for rings — both are handled exactly by OCCT.

### 2. `constraintSketch.detectArrangement()` / `detectArrangementRegion(seed)`

**File**: `src/forge/sketch/arrangement.ts`

DCEL-based planar arrangement detection from the raw line segments in a `ConstraintDefinition`.

Algorithm:
1. Extract non-construction line segments from `def.lines`.
2. Split segments at all pairwise intersections — both X-crossings (`segSegT`) and **T-junctions** (`pointOnSegT`). T-junction support is critical: when a divider endpoint touches a boundary edge interior, only `pointOnSegT` detects it.
3. Snap nearby nodes and build a clean planar graph.
4. Build DCEL half-edges. At each node sort outgoing half-edges by polar angle.
5. `next(u→v)` = outgoing from v immediately preceding `twin(u→v)` in CCW order at v — i.e., `out[(pos−1+n) % n]`.
6. Traverse all face cycles; keep CCW faces (positive signed area). CW = unbounded outer face, excluded.
7. Return each face as a `polygon(pts)` sketch.

No explicit loops needed from the caller. Works on any set of line constraints.

**STEP export**: each face is a `polygon()` — handled exactly.

### 3. `builderB.referenceFrom(sketchA, entityId)` / `referenceAllFrom(sketchA)`

**File**: `src/forge/sketch/constraints.ts`

Import solved geometry from another `ConstraintSketch` as fixed construction references.

- Fixed points (`fixed: true`) and construction lines (`construction: true`) participate in constraint solving but contribute zero area to the resulting CrossSection profile.
- `referenceFrom(source, id)` looks up the entity by id in the source's `ConstraintDefinition` and creates a fixed copy in the current builder.
- Enables constraints like `parallel(bBot, refBase)` to lock relationships between separate sketches.

**STEP export**: construction elements are ignored by `buildSketchFromDefinition` when assembling loops → no impact on export path.

---

## Backend Agnosticism

These APIs are fully backend-agnostic because they operate on:
- **2D coordinates only** — no 3D kernel calls during region/arrangement detection.
- **`polygon()`** — the lowest-level sketch primitive, available on every backend.
- **Boolean ops** — available on every backend (Manifold, OCCT, …).

No backend-specific code was added. Adding a new backend (e.g., CGAL, OpenCASCADE directly) automatically inherits all three APIs as long as it handles `polygon` and `boolean` plan kinds.

The only Manifold-specific call is `CrossSection.toPolygons()` in `regions.ts`. If a future backend doesn't use `CrossSection`, `sketchRegions` would need an adapter — but the algorithm and public API shape would be unchanged.

---

## Gotchas

### Empty CrossSection for loop-less sketches

`constrainedSketch().solve()` used to throw "at least one closed loop" when called without `addLoop()`. Users calling `.detectArrangement()` never add loops. Fix: return an empty `CrossSection` via `CrossSection.difference([unit, unit])` (not `new CrossSection([])` — Manifold's `polygons2vec` crashes on empty array).

### T-junctions

Interior-only intersection detection (`segSegT`) misses T-junctions entirely. A 3×2 grid yields only 4 cells instead of 6 if T-junctions aren't split. Always run `pointOnSegT` for every endpoint of every other segment against every segment.

### DCEL `next` pointer direction

The formula traces faces to the **LEFT** of each directed half-edge. CW winding = unbounded outer face. Keep only faces with positive signed area (CCW winding = bounded interior face).

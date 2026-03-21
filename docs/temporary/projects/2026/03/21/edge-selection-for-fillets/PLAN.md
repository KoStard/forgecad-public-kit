# Edge Selection for Fillets on Arbitrary Models

## Goal & Current State

**Goal**: Enable users to select edges from complex models (unions, booleans, hulls — not just box extrudes) and apply fillets/chamfers to them. The API should be LLM-friendly (pure scripting, no interactive picking required).

**The term**: "Fillet" (rounding an edge with a tangent arc) or "chamfer" (beveling with a flat cut).

**Current state**: ForgeCAD supports `filletEdge()` and `chamferEdge()` but **only on the 4 vertical edges of box extrudes** (`vert-bl`, `vert-br`, `vert-tr`, `vert-tl`). The resolution system (`edgeFeatureResolution.ts`) explicitly checks `SUPPORTED_VERTICAL_EDGE_NAMES` and rejects everything else.

**Motivating example**: `ams_lite_adapter.forge.js` — a cylindrical adapter built from `circle2d().subtract().extrude()`, booleans, and hulls. No tracked vertical box edges exist. Filleting the flange-to-body transition or the tooth tips is currently impossible.

## Architecture Summary

### What we have

1. **Manifold 3D kernel** — mesh-based, no native B-Rep edge concept
2. **TrackedShape** — topology overlay that names faces/edges through extrusion and limited propagation
3. **Sharp edge detection** (`geometryArrays.ts`) — already computes all sharp edges via dihedral angle analysis on the triangle mesh (halfedge map + face normal dot products). Threshold: 1° (cos ≈ 0.9998)
4. **Edge feature runtime** (`edgeFeatureRuntime.ts`) — constructs fillets/chamfers as boolean operations (subtract corner box, union cylinder for fillet; subtract triangle prism for chamfer). Works on any straight edge given `start`, `end`, `axis`, `basisX`, `basisY`, `quadrant`.

### The gap

The runtime can fillet **any straight edge** if given a `ResolvedEdgeFeatureSelection`. The bottleneck is **edge selection** — going from "I want to round this edge" to a `ResolvedEdgeFeatureSelection` with correct start/end/basis/quadrant.

### Key insight

The fillet runtime doesn't care about topology tracking — it just needs the edge geometry. We can bypass the TrackedShape/query propagation system entirely for a new "geometric edge selection" path.

## Design Space

### Option A: Geometric Edge Queries (recommended for LLM scripting)

Select edges by their geometric properties — position, direction, proximity to a point.

```js
// Select edge nearest to a 3D point
const edge = selectEdge(body, { near: [0, 37, 27] });

// Select edge nearest to a point, filtered by direction
const edge = selectEdge(body, { near: [0, 37, 27], parallel: [0, 0, 1] });

// Select all edges at a specific height
const edges = selectEdges(body, { atZ: 2, tolerance: 0.5 });

// Select by face adjacency (edge between top face and side)
const edge = selectEdge(body, { betweenNormals: [[0,0,1], [1,0,0]] });
```

**Pros**: Pure code, no UI needed, LLMs can reason about 3D coordinates, deterministic
**Cons**: Requires knowing approximate positions, fragile if model changes significantly

### Option B: Topological Edge Queries

Select edges by mesh topology — convexity, connectivity, angle.

```js
// All convex edges (outside corners)
const edges = selectEdges(body, { convex: true });

// All concave edges (inside corners)
const edges = selectEdges(body, { concave: true });

// Edges with dihedral angle in range
const edges = selectEdges(body, { dihedralAngle: { min: 45, max: 135 } });

// Longest edge
const edge = selectEdge(body, { longest: true });
```

**Pros**: Doesn't require knowing coordinates, more robust to model changes
**Cons**: Ambiguous on complex models ("which convex edge?"), harder for LLMs to target specific edges

### Option C: Hybrid (recommended)

Combine geometric + topological filtering:

```js
// Convex edge closest to flange transition
const edge = selectEdge(body, {
  near: [flangeOd/2, 0, flangeThick],
  convex: true
});

// All sharp edges in a bounding region
const edges = selectEdges(body, {
  within: { zMin: 0, zMax: flangeThick },
  minAngle: 30
});
```

### Option D: Interactive Selection (fallback)

User clicks edge in viewport, code captures the selection. Breaks pure scripting but useful for complex geometry where coordinates are unknown.

```js
// Opens picker, returns edge ref — blocks script execution
const edge = await pickEdge(body, "Select edge to fillet");
```

**Verdict**: Not viable for LLM-generated code. Could be a future UI feature.

## Implementation Plan

### Phase 1: Mesh Edge Extraction (the foundation)

Extract all sharp edges from any `Shape`'s mesh as `EdgeSegment[]`:

```ts
interface EdgeSegment {
  index: number;
  start: [number, number, number];
  end: [number, number, number];
  midpoint: [number, number, number];
  direction: [number, number, number]; // normalized
  length: number;
  dihedralAngle: number; // degrees, 0 = coplanar, 180 = knife
  convex: boolean; // true = outside corner
}
```

This reuses the halfedge infrastructure in `geometryArrays.ts` but returns structured data instead of just line positions.

### Phase 2: Edge Query API

```ts
function selectEdge(shape: Shape, query: EdgeQuery): EdgeSegment;
function selectEdges(shape: Shape, query: EdgeQuery): EdgeSegment[];

interface EdgeQuery {
  near?: [number, number, number];    // Sort by proximity to point
  parallel?: [number, number, number]; // Filter: edge direction ≈ parallel
  perpendicular?: [number, number, number]; // Filter: edge direction ⊥
  convex?: boolean;                    // Filter by convexity
  concave?: boolean;
  minAngle?: number;                   // Dihedral angle range (degrees)
  maxAngle?: number;
  minLength?: number;                  // Length range
  maxLength?: number;
  within?: BoundingRegion;             // Spatial filter
  atZ?: number;                        // Shorthand for within z-band
  tolerance?: number;                  // For atZ and other approximate matches
}
```

### Phase 3: Bridge to Fillet Runtime

Convert `EdgeSegment` → `ResolvedEdgeFeatureSelection`:

```ts
function filletEdgeSegment(shape: Shape, segment: EdgeSegment, radius: number, segments?: number): Shape;
function chamferEdgeSegment(shape: Shape, segment: EdgeSegment, size: number): Shape;
```

The key challenge: computing `basisX`, `basisY`, and `quadrant` from the mesh. The basis vectors define the plane perpendicular to the edge, and the quadrant tells which corner material to remove. For a mesh edge, these come from the two adjacent face normals.

### Phase 4: Circular/Curved Edge Support (future)

The current runtime only handles straight edges (extrude along axis → subtract box → union cylinder). Curved edges (like the top rim of a cylinder) would need a different approach — likely sweeping a fillet cross-section along the edge curve. This is significantly harder and may require Manifold's `smoothOut()` + `refine()` as an approximation.

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline: only box vertical edges supported | ✅ Current |
| P1 | Mesh edge extraction with structured data | ✅ Done — works well |
| P2 | Edge query API (selectEdge/selectEdges) | ✅ Done — works well |
| P3 | Bridge to fillet runtime (direct Manifold) | ⚠️ Flat-face only, bypasses compile plans |
| P3b | Crescent subtraction fix | ⚠️ Correct for flat faces, artifacts on curved |
| P4 | Curved edge / general fillet | 🔲 Needs proper surface-offset algorithm |
| P5 | Integrate with compile plan system | 🔲 Required for BREP export |

## Experiment Log

#### Baseline Analysis (CURRENT STATE)

**What**: Analyzed the existing fillet system end-to-end.

**Key findings**:
1. The fillet **runtime** (`edgeFeatureRuntime.ts`) is general — it works on any straight edge given start/end/basis/quadrant. Only 55 lines of code.
2. The fillet **resolution** (`edgeFeatureResolution.ts`) is the bottleneck — 300+ lines, hardcoded to `SUPPORTED_VERTICAL_EDGE_NAMES`, deeply tied to the TrackedShape/query-propagation system.
3. Sharp edge detection (`geometryArrays.ts`) already builds the halfedge map and computes dihedral angles, but only outputs `Float32Array` positions for rendering — it discards the structured edge data.
4. For the AMS adapter, there are ~50-100 sharp edges after all the booleans. An LLM could reason about them using `near:` queries with coordinates derived from the parametric dimensions.

**Lesson**: Don't fight the resolution system. Build a parallel "geometric selection" path that goes straight from mesh analysis → `ResolvedEdgeFeatureSelection` → runtime, bypassing TrackedShape entirely.

#### P1-P3: Mesh Edge Extraction + Query API + Fillet Bridge (SUCCESS)

**What**: Built three new modules:
1. `meshEdgeExtraction.ts` — extracts structured `EdgeSegment[]` from any Manifold mesh using halfedge + dihedral angle analysis
2. `edgeQuery.ts` — `selectEdge(shape, query)` / `selectEdges(shape, query)` with filters for `near`, `parallel`, `convex`, `atZ`, `within`, `minAngle`, etc. Plus `coalesceEdges()` for merging tessellation fragments.
3. `edgeSegmentFeatures.ts` — `filletEdgeSegment()` / `chamferEdgeSegment()` that convert EdgeSegment → ResolvedEdgeFeatureSelection and call the existing runtime.

**Result**: 14/14 tests pass. Works on boxes, cylinders, and boolean results. Edge extraction correctly identifies all 12 box edges (90° dihedral, convex). Query filters work. Fillet and chamfer produce valid geometry.

**Key finding — fillet volume anomaly**: The boolean fillet approach (diff corner + union cylinder) adds material where the cylinder extends beyond adjacent faces on convex external edges. Net volume change = +(π-1)×r²×length instead of the expected -(1-π/4)×r²×length. This is a **pre-existing limitation** of the runtime, not new to the edge query system. The visual result is still a smooth rounded edge — the "extra" material IS the fillet surface extending along the faces.

**Why it worked**: By deriving basisX/basisY/quadrant from the mesh face normals directly (instead of relying on tracked topology), we can fillet any straight edge of any shape. The quadrant is computed from the average outward normal: material is opposite to the outward-pointing direction.

**Lesson**: The runtime is simpler than expected — just needs start/end/basis/quadrant. The topology system was the complexity bottleneck, not the geometry.

## Key Design Decision: Straight Edges Only (Phase 1-3)

The fillet runtime constructs geometry by extruding a cross-section along the edge axis. This only works for straight edges. Circular edges (top/bottom rims of cylinders) are the most-wanted curved case, but require sweeping geometry along an arc — a fundamentally different approach.

**For Phase 1-3**: Limit to straight edges. The query API returns `EdgeSegment` with a `curvature` field (0 for straight). The fillet functions reject non-straight edges with a clear error message.

**For Phase 4**: Curved edges could use Manifold's `smoothOut(minSharpAngle)` + `refine()` as an approximation. This smooths all edges above a threshold rather than targeting specific ones, but it's the only built-in Manifold capability. True per-edge curved fillets would need custom sweep geometry.

#### AMS Adapter Analysis (FINDING — circular edges needed)

**What**: Analyzed the `ams_lite_adapter.forge.js` model to identify which edges would benefit from filleting.

**Finding**: The model's most impactful fillet targets are all **circular edges**:
1. Flange-to-body transition at z=`flangeThick` (2mm) — where the wider flange meets the narrower tube
2. Top rim of the cylinder at z=`h` (55mm)
3. Inner bore edges

The model has very few meaningful **straight** edges — the tooth edges from `hull3d()` are short and thin (0.1mm box seeds), and the cutout edges are already filleted in 2D via `filletCorners()`.

**Lesson**: For cylindrical/rotational parts (which are extremely common in mechanical design), circular edge fillet support (Phase 4) is essential. The straight-edge API is a solid foundation but won't satisfy the primary use case for this class of parts.

**Possible Phase 4 approaches**:
1. `smoothOut(minSharpAngle) + refine()` — Manifold's built-in edge smoothing. Applies to ALL sharp edges above the angle threshold, not selectable per-edge. Good for "fillet everything" but no per-edge control.
2. Sweep a fillet cross-section along the circular edge path — requires computing the edge curve from mesh data and constructing sweep geometry. Complex but precise.
3. Revolution approach — for axisymmetric parts, fillet the 2D profile before revolving. Doesn't help for post-boolean edges.

#### Cylinder-on-edge fillet attempt (FAILED — wrong geometry)

**What**: First attempt placed a full cylinder with its axis ON the edge and union'd it raw. This produced visible tubes sticking out of the surface.

**Fix attempted**: Offset the cylinder center to (qx×r, qy×r) in local frame (inside the body) and used a "crescent subtraction" approach: `diff(base, diff(corner, offset_cylinder))`. This correctly removes only the sharp crescent between the square corner and the cylinder arc.

**Result on box edges**: Correct. Volume decreases by (1−π/4)×r²×length as expected.

**Result on AMS adapter horizontal edges**: **Artifacts.** The crescent approach assumes both adjacent faces are flat planes. On the AMS adapter, one face is the flat top surface but the other is the **curved cylinder wall**. The square corner block doesn't match the actual wedge-shaped material at the edge — it overshoots into the curved body, creating visible bite marks.

**Root cause**: The "square corner + cylinder" construction is a **flat-face-only heuristic**, not a general fillet algorithm. It works for:
- 90° edges between two flat faces (boxes) ✓
- Edges between two flat faces at other angles (approximately) ✓

It fails for:
- Edges where one or both adjacent faces are curved ✗
- Edges where the dihedral angle varies along the edge length ✗

**Lesson**: A correct general fillet needs to derive its cutting/filling geometry from the actual adjacent surfaces, not from an assumed square cross-section. This is fundamentally a surface-offset problem.

#### Architecture mistake: bypassing the compile plan system (FAILED)

**What**: `filletEdgeSegment()` / `chamferEdgeSegment()` call the Manifold runtime directly, bypassing the compile plan system entirely.

**Why this is wrong**:
1. **BREP export breaks** — The compile plan is what gets lowered to CadQuery/OCCT for B-Rep output. By going straight to Manifold, BREP export has no idea fillets happened. The exported STEP/IGES file would have sharp edges where the viewport shows rounds.
2. **No undo/parameter history** — Compile plans record the full construction history. Direct Manifold calls produce an opaque mesh blob with no provenance.
3. **No topology propagation** — The TrackedShape query system loses all edge/face tracking after a direct Manifold operation. Subsequent operations that depend on topology (hole placement, further fillets, shell) would fail.

**Correct approach**: Edge selection (Phase 1-2) should produce an `EdgeQueryRef` that feeds into the existing compile plan system. The compile plan would record `{ kind: 'fillet', edge: EdgeQueryRef, radius, ... }` and get lowered to both Manifold and CadQuery correctly. This means extending the resolution system rather than bypassing it.

## Fundamental Problem: Fillet on Curved Surfaces

The "square corner + cylinder" boolean approach is a geometric shortcut that only works when both faces adjacent to the edge are flat planes. For real-world models (cylinders, spheres, lofts, boolean results), at least one face is typically curved.

**What a real fillet algorithm needs:**
1. **Surface offset** — Compute the offset surface of each adjacent face, moved inward by the fillet radius
2. **Spine curve** — Find the intersection of the two offset surfaces. This is the fillet center curve.
3. **Rolling ball** — The fillet surface is the envelope of a sphere of radius r rolling along the spine, tangent to both original faces
4. **Trimming** — Trim the original faces at the tangent curves and insert the fillet surface

This is what OpenCascade's `BRepFilletAPI_MakeFillet` does natively. Manifold (mesh-based) has no concept of surfaces, offsets, or tangent curves.

**Possible paths forward:**
1. **Route through CadQuery/OCCT for fillet** — Use the BREP export path to perform the fillet in OpenCascade, then re-import the result as a mesh. Heavy but correct.
2. **Manifold `smoothOut` + `refine`** — Marks edges for subdivision smoothing. Not a true fillet (radius isn't controllable), but produces smooth edges on any geometry.
3. **Analytical special cases** — For common configurations (flat+flat, flat+cylinder, cylinder+cylinder), derive the correct fillet geometry analytically. Cover 80% of practical cases.
4. **SDF-based fillet** — Use signed-distance-field blending (`levelSet`) to produce smooth transitions. Approximate but works on any geometry.

## Risks and Open Questions

1. **Edge coalescing**: Multiple short mesh edges may represent a single CAD edge (e.g., the top rim of a cylinder is many tiny segments). Need grouping by collinearity for straight edges.

2. **Quadrant ambiguity**: For edges that aren't axis-aligned, inferring the correct quadrant (which side has material to remove) requires analyzing the adjacent face normals. This should work but needs validation.

3. **Fillet on non-convex edges**: The current runtime assumes it's removing a convex corner. Filleting a concave edge (inside corner) requires the opposite boolean logic (add material). Needs separate handling.

4. **Performance**: Full mesh edge analysis on every `selectEdge()` call could be slow for high-poly models. May need caching.

5. **Determinism**: `selectEdge({near: point})` must return the same edge across re-evaluations. Mesh vertex ordering in Manifold should be deterministic, but needs verification.

## Files to Modify/Create

| File | Purpose |
|------|---------|
| `src/forge/meshEdgeExtraction.ts` | **New** — Extract structured `EdgeSegment[]` from mesh |
| `src/forge/edgeQuery.ts` | **New** — `selectEdge()` / `selectEdges()` query API |
| `src/forge/edgeFeatures.ts` | **Modify** — Add `filletEdgeSegment()` / `chamferEdgeSegment()` |
| `src/forge/edgeFeatureRuntime.ts` | **Possibly modify** — handle concave edges |
| `src/forge/forge-public-api.ts` | **Modify** — export new functions |
| `src/forge/geometryArrays.ts` | **Refactor** — extract shared halfedge/canonical logic |

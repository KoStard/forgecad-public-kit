# OCCT B-rep Rendering — Smooth Curves and Surfaces

## Goal & Current State

**Goal**: Render OCCT shapes with the visual quality of professional CAD tools (Fusion360, SolidWorks) by extracting smooth geometry directly from the B-rep instead of deriving it from the tessellated triangle mesh.

**Before**: Both Manifold and OCCT backends rendered identically — flat-shaded triangles with straight-line edges extracted from mesh dihedral angles. Curved surfaces (cylinders, fillets) showed visible faceting. This happened because the OCCT backend was treated as "just another triangle mesh producer" — its rich B-rep data (exact curves, surface normals) was thrown away during serialization.

**After**: OCCT shapes render with smooth per-vertex normals and smooth edge curves. Visually comparable to Fusion360.

## Root Cause Analysis

The rendering pipeline was designed for Manifold (a mesh-only kernel) and OCCT was bolted on as a second mesh source. Three specific design decisions baked in the limitation:

1. **`ShapeRuntimeMesh` only carries positions** — `numProp: 3` with no room for normals. OCCT's `Poly_Triangulation` stores per-vertex normals from the actual surface, but the exchange format had no field for them.

2. **Edges derived from mesh topology** — `computeSharpEdges()` detects edges by finding adjacent triangles with different normals (dihedral angle > 1deg). This produces straight line segments between triangle vertices, even though OCCT has exact parametric curves (`Geom_Circle`, `Geom_BSplineCurve`) on every edge.

3. **`flatShading: true` hardcoded** — The Three.js material forced flat shading with a comment explaining it as a CAD requirement. This is correct for Manifold (where averaging normals would blur box corners), but wrong for OCCT (where per-face vertex normals already encode sharp vs smooth edges correctly).

File comments reinforced this by framing everything as "Manifold mesh data" — making it non-obvious that OCCT had better data available.

## Architecture

### Manifold pipeline (unchanged)
```
Shape.getMesh() → triangles (positions only)
  → computeGeometryArrays() → flat face normals + mesh-derived edges
  → flatShading: true
```

### OCCT pipeline (new)
```
OCCTShapeBackend.getMeshWithNormals() → triangles + per-vertex B-rep normals
  → computeGeometryArrays(vertNormals) → smooth normals + mesh-derived edges (unused)
OCCTShapeBackend.getEdgeCurves() → smooth polylines from parametric curves
  → replaces geometryEdgePositions
  → flatShading: false (hasSmoothNormals flag)
```

### Why smooth normals work without indexed geometry

OCCT tessellates each face independently — vertices at shared edges are duplicated, each with normals from their own face's surface. This means:
- On a cylinder: adjacent face vertices at the seam have different normals → smooth interpolation across the face
- At a sharp edge (box corner): each face has its own vertices with its own normals → no blending across the edge
- No need for smooth groups, crease edges, or indexed geometry tricks

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | Flat shading + straight-line edges on curves | Measured |
| P1 | B-rep edge curves with adaptive sampling | Smooth edge lines from exact parametric geometry | Done |
| P2 | Edge deduplication via TopExp.MapShapes | Reliable unique edge iteration (replaces HashCode) | Done |
| P3 | Per-vertex normals from B-rep surface | Smooth shading on curved surfaces, flat on planar | Done |
| P4 | hasSmoothNormals flag through pipeline | Conditional flatShading in all renderers | Done |
| P5 | Updated file comments | Docs reflect dual-pipeline reality | Done |

## Risks

### 1. Normal extraction failure
**Risk**: Some OCCT triangulations may not have normals (`HasNormals()` returns false), and `ComputeNormals()` may fail. Currently we fall back to `null` vertNormals → flat shading for the entire shape.
**Mitigation**: The fallback is safe (just looks like before). Could be improved with per-face fallback — use smooth normals for faces that have them, flat for those that don't. Would require tracking which vertex ranges belong to which face.

### 2. Normal direction for reversed faces
**Risk**: We flip normals with `sign = reversed ? -1 : 1`. If OCCT's `Normal_1()` already accounts for face orientation in some cases, we'd double-flip. Haven't seen this in testing but it's possible with complex B-rep topologies (shells, multi-solid compounds).
**Mitigation**: Visual inspection catches this immediately (inside-out shading). If it happens, check `IsForward/IsReversed` vs `TopAbs_Orientation` semantics.

### 3. Edge curve sampling density
**Risk**: The adaptive sampling uses `EDGE_CURVE_ANGULAR_DEFLECTION = 5deg` and `MAX_DEPTH = 6`. For very large arcs (huge radius, small arc angle), 5deg may produce too few points. For tiny features, MAX_DEPTH=6 may produce excessive points.
**Mitigation**: Could scale angular deflection by arc length or bounding box diagonal. Current values work well for typical CAD parts (mm-scale).

### 4. FrozenShape reconstruction loses B-rep
**Risk**: When a `FrozenShape` needs geometric operations (cut planes, split), it reconstructs a Manifold backend from the cached mesh — losing all OCCT B-rep data. The result renders with flat shading and mesh-derived edges.
**Mitigation**: This only affects interactive cut planes on OCCT shapes. Long-term fix: serialize enough B-rep data (STEP/BREP format) to reconstruct an OCCT backend, or keep the OCCT shape alive in the worker and proxy operations to it.

### 5. Performance — double mesh extraction
**Risk**: `getMeshWithNormals()` extracts the full mesh + normals, then `getEdgeCurves()` iterates all edges separately. For complex shapes this is two passes over the topology.
**Mitigation**: Could combine into a single pass. Current overhead is small (edges are fast — just curve evaluation, no tessellation). Profile if it becomes a bottleneck.

### 6. Manifold still uses flat shading
**Risk**: Not a bug, but a visual quality gap. Users switching between backends will see a noticeable difference. Manifold shapes look faceted, OCCT shapes look smooth.
**Mitigation**: Could add dihedral-angle-based normal averaging for Manifold (smooth normals where adjacent triangles have < 30deg angle, flat where > 30deg). This is a well-known technique ("smooth groups") but adds complexity and is heuristic-based.

## Future Improvements

1. **Adaptive edge sampling by screen space** — Currently angular deflection is fixed. Could scale by bounding box size or even camera distance (LOD).

2. **OCCT mesh tessellation quality tied to quality preset** — The `DEFAULT_LINEAR_DEFLECTION = 0.1` is hardcoded. Should respect the `ForgeQualityPreset` (live/default/high) for faster preview and finer export.

3. **Per-face normal fallback** — Instead of all-or-nothing `hasSmoothNormals`, track which faces have B-rep normals and which need flat fallback. Rare but possible for degenerate geometry.

4. **Manifold smooth groups** — Heuristic normal averaging for the Manifold backend. Would close the visual gap between backends without requiring B-rep data.

5. **B-rep serialization for FrozenShape** — Serialize OCCT shapes as BREP/STEP so reconstruction preserves the full B-rep. Would fix the cut-plane quality regression.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/backends/occt/shapeBackend.ts` | `extractEdgeCurvesFromShape()`, `extractMeshFromShape()` (now returns normals), `getMeshWithNormals()`, `getEdgeCurves()`, updated header |
| `src/forge/mesh/geometryArrays.ts` | `computeGeometryArrays()` accepts optional `vertNormals`, updated header |
| `src/forge/serializeRunResult.ts` | Detects OCCT backend, uses B-rep edges + smooth normals |
| `src/workers/evalWorkerProtocol.ts` | Added `hasSmoothNormals` to `SerializedShapeData` |
| `src/forge/frozenShape.ts` | `PrecomputedGeometry` includes `hasSmoothNormals`, updated header |
| `src/forge/mesh/meshToGeometry.ts` | `ForgeGeometry` includes `hasSmoothNormals`, updated header |
| `src/components/viewport/ForgeObject.tsx` | `flatShading={!hasSmoothNormals}`, updated header |
| `src/components/viewport/orbitGif.ts` | Dynamic flatShading |
| `src/forge/scene/sceneBuilder.ts` | Dynamic flatShading for headless renderer |

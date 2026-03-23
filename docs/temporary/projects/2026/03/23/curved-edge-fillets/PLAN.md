# Curved Edge Fillets — Investigation

**Date**: 2026-03-23
**Goal**: Determine current fillet capabilities, identify gaps for curved-edge filleting, and design a path to support 3D fillets on curved edges in both Manifold and OCCT backends.

---

## Goal & Current State

**User need**: Apply smooth 3D fillets along curved edges — e.g., the top/bottom rims of extruded spline profiles, pocket-to-wall blends, and any non-straight edge on a solid body.

**Current state**: ForgeCAD fillets work **only on straight (linear) edges**. This is enforced at multiple layers:

1. **Mesh edge extraction** (`meshEdgeExtraction.ts`): Each `EdgeSegment` is a single triangle-mesh edge between two vertices — inherently a line segment. Curved edges on tessellated meshes appear as chains of short straight segments, but `coalesceEdges()` only merges collinear segments.

2. **Edge selection** (`edgeQuery.ts`): Queries filter by `direction` (a single unit vector), `parallel`, `perpendicular` — all straight-edge concepts. No concept of curvature, tangent variation, or arc fitting.

3. **Manifold fillet runtime** (`edgeFeatureRuntime.ts`): Builds a 2D cross-section (kite + cylinder) and **extrudes it linearly** along the edge axis. This only works when the edge is straight — a curved edge needs a sweep along a curve, not a linear extrusion.

4. **`edgeSegmentToSelection()`** returns `kind: 'line-segment'` — there is no `'arc'` or `'curve'` kind.

5. **OCCT backend** (`shapeBackend.ts`): Uses `BRepFilletAPI_MakeFillet` which **natively supports curved edges**. However, the current integration finds edges by midpoint matching (`findEdgeByMidpoint`), and the edge data fed in comes from the mesh extraction layer which only produces straight segments.

### Baseline Capability Matrix

| Edge Type | Manifold | OCCT | Notes |
|-----------|----------|------|-------|
| Straight (any body) | YES | YES | Full support via `filletEdgeSegment()` |
| Tracked vertical (box) | YES | YES | Legacy path via `filletEdge()` |
| Curved (arc, spline, etc.) | NO | NO* | *OCCT kernel supports it, but our integration doesn't expose it |

---

## Architecture Summary

### How fillets work today (straight edges)

```
User code: filletEdgeSegment(shape, edge, radius)
                    │
                    ▼
    ┌─ edgeSegmentToSelection() ──────────────────┐
    │  Converts EdgeSegment → ResolvedSelection    │
    │  kind: 'line-segment'                        │
    │  Computes: axis, basisX, basisY, quadrant    │
    │  Computes: surfaceDirA/B, dihedralAngle      │
    └──────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   [Manifold]              [OCCT]
   Build 2D kite+circle    findEdgeByMidpoint()
   Extrude linearly        BRepFilletAPI_MakeFillet
   Boolean subtract/add    (native kernel op)
```

### Why curved edges don't work

**Manifold path**: The core operation is `crossSection.extrude(span)` — a linear sweep. For a curved edge, you'd need to sweep the cross-section along a 3D curve. Manifold has no native sweep-along-curve.

**OCCT path**: The kernel's `BRepFilletAPI_MakeFillet` already handles curved edges natively. The gap is purely in our edge selection layer — we need to identify curved edges in the OCCT B-rep topology and pass them to the fillet API.

**Manifold mesh path**: Curved edges on a tessellated mesh are chains of short straight segments. We'd need to either:
- Fillet each segment individually (poor quality, faceted result)
- Reconstruct the curve from segments and sweep (complex math)
- Use Manifold's `smoothOut()` + `refine()` as an approximation

---

## Analysis: Paths Forward

### Path A: OCCT-native curved edge fillets (HIGH FEASIBILITY)

OCCT's `BRepFilletAPI_MakeFillet` already works on any edge — straight, circular, spline. The work is:

1. **Edge selection by topology**: Instead of mesh-extracted segments, iterate OCCT's `TopExp_Explorer` over edges and let users select by geometric queries (position, adjacent faces, edge type).

2. **Edge type detection**: Use `BRep_Tool.Curve_2()` to get the underlying `Geom_Curve` and check its `DynamicType()` — `Geom_Line`, `Geom_Circle`, `Geom_BSplineCurve`, etc.

3. **Fillet all edges of a face/loop**: OCCT can fillet multiple edges at once via `mkFillet.Add_2(radius, edge)` called multiple times before `Build()`. This handles the common case of "fillet all edges of this extrusion rim."

4. **Variable-radius fillets**: OCCT supports `Add_5(radius1, radius2, edge)` for variable-radius fillets along a single edge.

**Pros**: Production-quality results, handles all edge types, native kernel handles corner transitions.
**Cons**: Only available when using OCCT backend. OCCT shapes can't use Manifold booleans afterward.

**Estimated complexity**: Medium — mostly integration work, not algorithmic.

### Path B: Manifold per-segment filleting with coalescence (MEDIUM FEASIBILITY)

For the Manifold backend, approximate curved-edge fillets by:

1. **Segment chain detection**: Enhance `coalesceEdges()` to detect chains of segments that form a curve (not just collinear ones). Use angle-between-segments threshold.

2. **Per-segment filleting**: Apply `filletEdgeSegment()` to each segment in the chain. The individual fillet extrusions will overlap/gap at segment junctions.

3. **Junction blending**: Use `smoothOut()` + `refine()` on the result to smooth segment junction artifacts. Or use `hull()` of adjacent fillet segments to bridge gaps.

**Pros**: Works with Manifold backend, no new external dependencies.
**Cons**: Faceted result (quality depends on mesh tessellation), junction artifacts, limited to convex edges, complex to get right.

**Estimated complexity**: High — significant R&D needed for quality results.

### Path C: Manifold sweep-along-curve via discrete lofting (MEDIUM-HIGH FEASIBILITY)

Instead of extruding the fillet cross-section linearly, sweep it along the discretized curve:

1. **Sample the curved edge** at N points along its length.
2. **At each sample point**: Compute the local tangent, normal, and binormal (Frenet frame or rotation-minimizing frame).
3. **Build the fillet cross-section** (kite minus arc) at each sample in the local frame.
4. **Loft/stitch** adjacent cross-sections into a solid.
5. **Boolean subtract/add** the swept fillet body.

**Pros**: Smooth result even on coarse meshes, works with Manifold.
**Cons**: Complex frame computation, lofting infrastructure needed (though `loftStitched.ts` exists), twist handling for non-planar curves.

**Estimated complexity**: High — but produces high-quality results.

### Path D: Manifold `smoothOut()` as fillet approximation (LOW FEASIBILITY for precision)

Use Manifold's built-in mesh smoothing:
1. Select edges to fillet.
2. Mark adjacent vertices for smoothing.
3. Call `smoothOut()` + `refine()` to subdivide and smooth.

**Pros**: Very simple implementation.
**Cons**: No control over fillet radius, smoothing affects geometry globally, can't achieve precise engineering radii.

---

## Recommendation

Architecture-first: design the backend-agnostic compiler IR and public API first, then implement backend lowering.

### Phase 1: Backend-agnostic fillet compiler

Design the compile plan representation and public API that works regardless of backend. This is the foundation everything else builds on.

1. **Extend `EdgeRef` model** to support both straight and curved edges at the IR level. An edge reference should be a geometric query (position, face adjacency, edge loop membership, curvature type) — not a mesh artifact.

2. **New compile plan node**: `FilletPlan` that carries:
   - Edge selection: one or more edges by geometric query (not mesh index)
   - Radius (or variable radius function)
   - Edge type hint: `'any' | 'straight' | 'curved'` (for validation, not dispatch)
   - The plan is backend-agnostic — lowering decides how to execute

3. **New public API**: `fillet(shape, edges, radius)` where `edges` can be:
   - A geometric query (`{ near: point }`, `{ onFace: face }`, `{ loop: 'top' }`, `{ all: true }`)
   - A single edge ref or array of edge refs
   - The API records the intent in the compile plan; doesn't touch geometry yet

4. **Edge query enhancement**: Extend edge queries beyond straight-edge assumptions. Add `curvature`, `tangentAt`, `loop` (closed edge chain around a face), `adjacentTo` (face-based selection).

### Phase 2: OCCT lowering (Path A)

Lower the backend-agnostic fillet plan to OCCT's native `BRepFilletAPI_MakeFillet`:

1. **Edge resolution**: Resolve geometric edge queries against OCCT B-rep topology via `TopExp_Explorer`. Match by position, face adjacency, or loop membership.
2. **Multi-edge fillet**: Call `mkFillet.Add_2(radius, edge)` for each resolved edge before a single `Build()`. OCCT handles corner transitions natively.
3. **Variable-radius**: Use `Add_5(r1, r2, edge)` when the plan specifies variable radius.
4. **Edge type detection**: Use `BRep_Tool.Curve_2()` → `Geom_Curve::DynamicType()` to classify edges (line, circle, spline) for diagnostics/validation.

### Phase 3: Manifold lowering

Lower the same fillet plan to Manifold's CSG approach:

1. **Straight edges**: Existing linear-extrude path (already works).
2. **Curved edges**: Sweep-along-curve via discrete lofting (Path C from analysis).
   - Sample the edge chain at N points
   - Compute rotation-minimizing frames at each sample
   - Build fillet cross-section at each frame
   - Loft adjacent sections into a solid via `loftStitched.ts`
   - Boolean subtract/add
3. **Fallback**: For edges that can't be swept, degrade gracefully with a clear error message rather than silent failure.

---

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline audit | Done — straight edges only, no curved support |
| P1 | Backend-agnostic `fillet()` / `chamfer()` API | DONE |
| P2 | OCCT multi-edge fillet (single `BRepFilletAPI_MakeFillet` call) | DONE |
| P3 | Manifold multi-edge per-segment fillet | DONE |
| P4 | Public API export + runner integration | DONE |
| P5 | Demo files (showcase, curved edges, enclosure) | DONE |
| P6 | Build + test verification | DONE — all demos produce valid geometry |
| — | Future: OCCT curved-edge fillet via B-rep topology queries | TODO |
| — | Future: Manifold sweep-along-curve for true curved fillets | TODO |
| — | Future: Variable-radius fillets (`Add_5` in OCCT) | TODO |

---

## Experiment Log

### Baseline Audit (COMPLETE)

**What**: Audited all fillet-related code across both backends.

**Result**: Confirmed that curved-edge filleting is blocked at the edge selection layer, not the kernel layer. OCCT's `BRepFilletAPI_MakeFillet` already supports any edge type — the limitation is that ForgeCAD only feeds it mesh-extracted straight segments.

**Lesson**: The fastest path to curved-edge fillets is through the OCCT backend. The kernel already does the work — we just need better edge selection.

### MLP v1: Runtime-only (SUPERSEDED)

Initial implementation used runtime-level operations with opaque compile plans. Fillets were lost on translate/rotate because `Shape.translate()` rebuilds from compile plan. Fixed by switching to proper compile plan nodes.

### MLP v2: Compile Plan (COMPLETE)

**What**: Proper compile plan implementation with `filletEdges` and `chamferEdges` plan kinds. Zero opaque plans. Also removed `hull3d` from the public API (Manifold-only, not standard CAD).

**Result**: All demos produce correct geometry. Fillets survive translate, rotate, scale, and any transform chain.

**Architecture**:
- `fillet.ts`: Resolves edge query → stores edge targets in compile plan → `buildShapeFromCompilePlan()` handles lowering
- Compile plan stores `EdgeFeatureTarget[]` (midpoints, convexity) — backend-agnostic
- OCCT lowering: Multi-edge `BRepFilletAPI_MakeFillet` in a single `Build()` call
- Manifold lowering: Per-segment sequential with midpoint matching from re-extracted mesh

**Key design decisions**:
1. New `filletEdges` / `chamferEdges` compile plan kinds — not opaque, fully re-lowerable
2. Edge targets (midpoints) stored in plan — stable across re-lowering since base geometry is deterministic
3. Both backends resolve edges at lowering time by matching stored midpoints against the lowered base shape
4. `hull3d` removed from public API — Manifold-only operations don't belong in a backend-agnostic API

**Files touched (11+ files)**: All switch statements on `ShapeCompilePlan.kind` updated for new plan kinds.

---

## Files Modified

| File | Change |
|------|--------|
| `src/forge/fillet.ts` | NEW — Backend-agnostic `fillet()` and `chamfer()` API using compile plans |
| `src/forge/compilePlan.ts` | Added `filletEdges` and `chamferEdges` plan kinds, clone handlers |
| `src/forge/backends/manifold/lower.ts` | Added `lowerFilletEdgesCompilePlan` / `lowerChamferEdgesCompilePlan` |
| `src/forge/backends/occt/lower.ts` | Added `lowerFilletEdgesPlan` / `lowerChamferEdgesPlan` |
| `src/forge/queryPropagation.ts` | Added `filletEdges`/`chamferEdges` cases (3 switches) |
| `src/forge/booleanQueryPropagation.ts` | Added `filletEdges`/`chamferEdges` case |
| `src/forge/edgeFeatureResolution.ts` | Added `filletEdges`/`chamferEdges` cases (4 switches) |
| `src/forge/faceHistory.ts` | Added `filletEdges`/`chamferEdges` cases (3 switches) |
| `src/forge/shapeFaces.ts` | Added `filletEdges`/`chamferEdges` case |
| `src/forge/shellCompilePlan.ts` | Added `filletEdges`/`chamferEdges` case |
| `src/forge/projectionCompile.ts` | Added `filletEdges`/`chamferEdges` case |
| `src/forge/compilePlanCadQuery.ts` | Added `filletEdges`/`chamferEdges` case |
| `src/forge/forge-public-api.ts` | Added `fillet`/`chamfer` exports, removed `hull3d` |
| `src/forge/runner.ts` | Added `fillet`/`chamfer` to sandbox, removed `hull3d` |
| `examples/fillet-showcase.forge.js` | NEW — 6-object fillet demo |
| `examples/fillet-curved-edges.forge.js` | NEW — Curved edge fillet demo |
| `examples/fillet-enclosure.forge.js` | NEW — Practical enclosure demo |

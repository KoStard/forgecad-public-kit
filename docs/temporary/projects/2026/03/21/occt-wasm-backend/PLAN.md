# OCCT WASM Backend — Replace Manifold with OpenCascade.js

## Goal

Evaluate replacing Manifold (mesh-based kernel) with OpenCascade.js (B-rep kernel) as ForgeCAD's runtime geometry engine. The hypothesis: OCCT as WASM would unlock real B-rep geometry, native fillets/chamfers, exact NURBS, and topology tracking — capabilities that are fundamentally impossible with a mesh kernel.

## Current State (Baseline)

| Aspect | Manifold (current) | OCCT (target) |
|--------|-------------------|---------------|
| **Geometry model** | Triangle mesh | B-rep (NURBS surfaces + topology) |
| **Boolean ops** | Fast, guaranteed manifold | Slower but exact, preserves topology |
| **Fillets/chamfers** | Mesh approximation (corner block - cylinder hack) | Native `BRepFilletAPI_MakeFillet`, variable radius, exact |
| **STEP export** | Requires Python/CadQuery subprocess | Native — OCCT IS the STEP kernel |
| **Topology tracking** | Synthetic (name propagation through mesh ops) | Native (faces/edges survive booleans) |
| **Bundle size** | ~2.5MB (npm), ~600KB WASM | ~7MB custom build (2.4MB compressed) |
| **Maturity** | Stable (v3.4.0) | opencascade.js v2.0.0-beta |
| **API complexity** | Small, clean JS API | Huge C++ API surface via Emscripten |

## Architecture Summary

ForgeCAD already has a multi-backend architecture designed for this:

```
User script (.forge.js)
    ↓
Kernel API (kernel.ts — Shape, Sketch)
    ↓
CompilePlan IR (compilePlan.ts — backend-agnostic intent)
    ↓
  ┌─────────────────────┬──────────────────────────┐
  │ Manifold Lowerer    │ CadQuery/OCCT Lowerer    │
  │ compilePlanManifold │ compilePlanCadQuery       │
  │ → ShapeBackend      │ → JSON → Python → STEP   │
  └─────────────────────┴──────────────────────────┘
```

**Key abstraction points:**
1. `ShapeBackend` interface (30+ methods) — runtime geometry operations
2. `CompilePlan` IR — backend-agnostic shape intent tree
3. `compilePlanCadQuery.ts` — already lowers to OCCT-compatible operations
4. `forge-brep-export.py` — Python CadQuery executor for STEP export

## What OCCT Unlocks (The "Why")

### 1. Real Fillets & Chamfers
Current: `edgeFeatureRuntime.ts` creates fillets by subtracting a corner block and unioning a cylinder. This is a mesh hack — it only works on straight vertical edges, produces tessellation artifacts, and can't do variable radius.

OCCT: `BRepFilletAPI_MakeFillet` handles arbitrary edges, variable radius, chamfer angles, and blends between multiple surfaces. This is the #1 gap in the Fusion360 parity table.

### 2. Exact STEP/IGES Export Without Python
Current: Export requires spawning a Python subprocess with CadQuery, re-executing the entire compile plan, then writing STEP. Two kernels, two execution paths, potential divergence.

OCCT: The runtime kernel IS the export kernel. `BRepTools::Write()` directly serializes the live B-rep to STEP/BREP/IGES. Zero divergence, instant export.

### 3. Native Topology Tracking
Current: Manifold destroys topology on booleans. ForgeCAD rebuilds it synthetically via `queryModel.ts` — fragile, limited to extruded shapes, breaks on complex operations.

OCCT: `TNaming_NamedShape` tracks face/edge identity through every operation. Boolean results carry exact provenance. `shape.face('top')` becomes a real topological query, not a geometric heuristic.

### 4. NURBS Surfaces
Current: Manifold only knows triangles. Organic surfaces require `levelSet()` SDF sampling — slow and approximate.

OCCT: Native B-spline/NURBS surface creation. Real ruled surfaces, sweeps along curves, surface blending.

### 5. Import Capabilities
Current: No native CAD import.

OCCT: `STEPControl_Reader`, `IGESControl_Reader` — import industry-standard files directly into the modeling session.

## Risks & Challenges

### 1. Bundle Size (7MB vs 2.5MB)
OCCT WASM is ~3x larger. Custom builds can trim unused modules. With brotli compression: ~2.4MB for a custom build. Manifold compressed is ~600KB.

**Mitigation:** Custom build including only: BRepPrimAPI, BRepAlgoAPI, BRepFilletAPI, BRepBuilderAPI, BRepMesh, STEPControl, TopExp, BRep_Tool.

### 2. Beta Status
opencascade.js v2.0.0 is in beta. API may change.

**Mitigation:** Wrap behind ShapeBackend interface — isolates ForgeCAD from upstream churn.

### 3. Performance
OCCT boolean operations are typically slower than Manifold's (B-rep intersection is harder than mesh intersection). Complex models with many booleans could be noticeably slower.

**Mitigation:** Measure. Profile real ForgeCAD models. May need mesh-based preview + OCCT for final geometry.

### 4. Mesh Extraction for Rendering
Three.js needs triangles. OCCT stores B-rep. Need `BRepMesh_IncrementalMesh` to tessellate for rendering.

**Mitigation:** OCCT includes tessellation. Quality/speed tradeoff is configurable.

### 5. Memory Management
OCCT objects need explicit deletion (C++ semantics via Emscripten). Manifold handles this automatically.

**Mitigation:** RAII wrapper in ShapeBackend. `using` / `Symbol.dispose` pattern.

## Strategy Options

### Option A: Full Replace (Manifold → OCCT)
Replace `ManifoldShapeBackend` with `OCCTShapeBackend`. All operations go through OCCT.

**Pro:** Single kernel, no divergence, simplest architecture.
**Con:** Highest risk, performance unknown, beta dependency for everything.

### Option B: Hybrid (OCCT for features Manifold can't do)
Keep Manifold for fast preview/booleans. Use OCCT only for fillets, chamfers, STEP export, and topology.

**Pro:** Incremental, keeps proven fast path.
**Con:** Two kernels in memory, synchronization complexity, divergence risk.

### Option C: OCCT Primary, Manifold Fallback
OCCT as primary backend. Fall back to Manifold for operations where OCCT is too slow or unsupported.

**Pro:** Gets OCCT benefits, graceful degradation.
**Con:** Complex routing logic.

**Recommended: Option A with staged rollout.** The whole point of the CompilePlan IR is to make backends swappable. Build the OCCT backend behind a feature flag, measure, then cut over.

## Progress Tracker

| # | Experiment | Result | Status |
|---|-----------|--------|--------|
| — | Baseline: Manifold runtime | 445KB WASM, mesh fillets, Python STEP export | Current |
| P1 | opencascade.js loads in Node.js | 1.7–4s init (48MB full WASM) | ✅ |
| P2 | Basic primitives (box, cylinder, sphere) | Box 18ms, Sphere 14ms, Cylinder 4ms | ✅ |
| P3 | Boolean operations (union, difference, intersection) | Union 90ms, Cut 85ms, Intersection 40ms | ✅ |
| P4 | Extrude + revolve from wire/face | Extrude 9ms, Revolve 13ms | ✅ |
| P5 | Real fillet on arbitrary edge | ALL edges 58ms, variable radius 94ms | ✅ KILLER |
| P6 | Chamfer on all edges | 24 edges in 41ms | ✅ |
| P7 | Mesh extraction (BRepMesh_IncrementalMesh) | Works — TopExp_Explorer + Triangulation | ✅ |
| P8 | STEP export without Python | 32.8KB STEP in 81ms, no Python needed | ✅ |
| P9 | Bundle size | 48MB WASM (13.2MB gzip) — full build, needs custom | ⚠️ |

## Experiment Log

#### P1: WASM Initialization (SUCCESS)
**What**: `npm install opencascade.js@beta`, import from `opencascade.js/dist/node.js`, `await initOpenCascade()`.
**Result**: Init in 1.7–4s (varies by run). Full API surface available.
**Lesson**: Node.js entry point works out of the box. No browser needed for testing.

#### P2: Basic Primitives (SUCCESS)
**What**: `BRepPrimAPI_MakeBox_2`, `BRepPrimAPI_MakeSphere_1`, `BRepPrimAPI_MakeCylinder_1`.
**Result**: Box 24v/12t (18ms), Sphere 273v/516t (14ms), Cylinder 106v/100t (4ms).
**Lesson**: API is straightforward. Suffix numbers (`_2`, `_1`) correspond to C++ constructor overloads.

#### P3: Boolean Operations (SUCCESS)
**What**: `BRepAlgoAPI_Fuse_3`, `BRepAlgoAPI_Cut_3`, `BRepAlgoAPI_Common_3`.
**Result**: Union 90ms, Cut 85ms, Intersection 40ms.
**Lesson**: Slower than Manifold (which does booleans in ~1–5ms) but produces exact B-rep with preserved topology. For interactive modeling, may need batching/async.

#### P4: Extrude + Revolve (SUCCESS)
**What**: Build wire from edges → MakeFace → BRepPrimAPI_MakePrism / MakeRevol.
**Result**: Extrude 9ms, Revolve 13ms. Both produce valid meshable shapes.
**Gotcha**: `BRepBuilderAPI_MakeWire_1()` + `Add_2()` returns `TopoDS_Shape` not `TopoDS_Wire`. Must use `MakeWire_2(firstEdge)` + `Add_1()` to get proper typing.
**Lesson**: WASM bindings have strict C++ type checking via Emscripten. Overload selection matters.

#### P5: Real Fillet — THE Killer Feature (SUCCESS)
**What**: `BRepFilletAPI_MakeFillet` with `ChFi3d_Rational` mode. Tested: all 24 edges, single edge, variable radius (1→4mm).
**Result**:
- All 24 edges of a box, r=3: 536v/628t in 58ms
- Single edge, r=5: 54v/40t in 8ms
- Variable radius 1→4 on one edge: 126v/160t in 94ms
**Why this is huge**: Manifold's fillet is a mesh hack (corner block - cylinder). It only works on straight vertical edges, can't do variable radius, produces tessellation artifacts. OCCT's fillet works on ANY edge, ANY radius, with exact NURBS surfaces.
**Lesson**: This alone justifies the migration.

#### P6: Chamfer (SUCCESS)
**What**: `BRepFilletAPI_MakeChamfer` on all 24 edges of a box.
**Result**: 96v/44t in 41ms.
**Lesson**: Clean API, same pattern as fillet.

#### P7: Mesh Extraction (SUCCESS)
**What**: `BRepMesh_IncrementalMesh_2` + `TopExp_Explorer` over faces + `BRep_Tool.Triangulation` to extract vertices and triangles.
**Result**: Works perfectly. Produces position arrays and triangle indices directly usable by Three.js.
**Lesson**: The mesh extraction pipeline is ~20 lines of code. Deflection parameter controls quality/performance tradeoff.

#### P8: STEP Export Without Python (SUCCESS)
**What**: `STEPControl_Writer_1` → `Transfer` → `Write` to WASM virtual FS.
**Result**: 32.8KB STEP file for a filleted boolean shape, exported in 81ms.
**Why this is huge**: Currently ForgeCAD spawns a Python subprocess with CadQuery to export STEP. With OCCT WASM, the runtime kernel IS the export kernel. Zero divergence, instant export, no Python dependency.
**Lesson**: The STEP output writes to Emscripten's virtual filesystem. Read with `oc.FS.readFile()`.

#### P9: Bundle Size (NEEDS WORK)
**What**: Measured full build sizes.
**Result**:
- opencascade.js full WASM: 48MB raw, 13.2MB gzipped
- Manifold WASM: 445KB raw
- Ratio: ~107x larger raw, ~30x larger compressed
**Mitigation**: Custom builds can trim to ~7MB raw (~2.4MB compressed) by including only needed modules. Need to test.
**Lesson**: Full build is too large for browser. Custom build is mandatory for production.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/forge/occtBackend.ts` | New `OCCTShapeBackend` implementing `ShapeBackend` |
| `src/forge/occtInit.ts` | WASM initialization for opencascade.js |
| `src/forge/compilePlanOCCT.ts` | Lower CompilePlan IR directly to OCCT operations |
| `src/forge/shapeBackend.ts` | Add `requireOCCT()` method, generalize return types |
| `vite.config.ts` | WASM serving config for opencascade.js |
| `package.json` | Add opencascade.js dependency |

## Next Steps

1. **P1: Proof of life** — Install opencascade.js, load WASM in a Vite worker, create a box, extract mesh, render in Three.js
2. **P2-P4: Core operations** — Implement primitives + booleans + extrude/revolve
3. **P5: The killer feature** — Real fillet on an arbitrary edge
4. **P6-P7: Integration** — Mesh pipeline + STEP export
5. **P8-P9: Validation** — Performance + bundle size measurements

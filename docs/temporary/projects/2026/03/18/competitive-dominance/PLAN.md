# ForgeCAD Competitive Dominance Plan

## Goal

Make ForgeCAD a no-brainer choice over FreeCAD, SolveSpace, and Dune 3D in every dimension except the code-first workflow (which we accept as a deliberate trade-off). The report from the comparison tool identified several areas where competitors are "better" — this plan corrects inaccuracies in that report and identifies the real gaps that need closing.

## Report Accuracy Check

The comparison report contains several outdated or incorrect claims. Here's what's actually true:

| Report Claim | Reality | Status |
|---|---|---|
| "missing fillets" | `filletEdge()` and `chamferEdge()` exist, plus `filletCorners()` for 2D | **Exists** (mesh-based, not BREP-precise) |
| "missing shell" | `shell(thickness, openFaces)` is implemented | **Exists** |
| "missing sketch-on-face" | `sketch.onFace(body, face, opts)` works | **Exists** |
| "limited assemblies" | Full assembly system: revolute/prismatic/fixed joints, coupling, BOM, collision detection | **Exists and strong** |
| "no STEP export" | STEP/BREP export via CadQuery backend | **Exists** |
| "comparable to FreeCAD Sketcher" | 36 constraint types including shape constraints FreeCAD doesn't have (shapeArea, shapeCentroid) | **Arguably stronger in some areas** |
| "arc constraint missing" | Arc is a first-class entity (`SketchArc`) with center/start/end/radius/clockwise, fully integrated into solver | **Exists** |
| "not as seamless as SolveSpace for 3D" | No 3D constraint solver | **Accurate gap** |
| "not battle-tested for huge assemblies" | True — no stress testing at scale | **Accurate gap** |

## Real Competitive Gaps (What Actually Needs Closing)

### Tier 1 — Blocking gaps (do now or soon)

| Gap | Who beats us | Impact | Difficulty | Status |
|---|---|---|---|---|
| **G1: BREP-precise fillets/chamfers** | All three (they use BREP kernels) | Mesh-based fillets lack exact radius control | Hard (kernel) | Think big |
| **G2: DXF export (2D sketches)** | All three | Laser cutting, CNC, 2D fabrication | Low | **Implemented** |
| **G3: SVG export (2D sketches)** | N/A — unique opportunity | 2D sketch export for web, laser, design | Low | **Implemented** |
| **G4: Trim/extend sketch entities** | All three | Basic sketch editing | Medium | Think big |
| **G5: Spline/B-spline in constraints** | SolveSpace, FreeCAD | Organic curves in constraint solving | Medium | Think big |
| **G6: glTF/GLB export** | Modern web pipeline standard | Web viewers, AR, modern 3D pipeline | Low-Medium | Think big |

### Tier 2 — Strategic advantages to amplify

| Area | Current State | What "10x" looks like |
|---|---|---|
| **2D sketch export ecosystem** | Sketches can extrude/revolve but not export directly | SVG + DXF export from any sketch, constrained or not. The 2D sketch becomes a first-class output. |
| **Constraint solver UX** | 36 types, GS+NR solver, arcs supported | Sub-millisecond solving, visual constraint status, automatic DOF analysis |
| **Export ecosystem** | STL, 3MF, STEP, PDF, PNG, GIF + new SVG/DXF | Add glTF/GLB, OBJ, IGES. Be the format king. |
| **Assembly system** | Joints + BOM + collision | Mechanism simulation, motion envelopes, tolerance analysis |
| **AI/LLM workflow** | Good API shape for LLMs | Verified benchmarks showing ForgeCAD > competitors for AI-generated models |
| **Notebook workflow** | Basic cells | Rich iteration with inline 3D previews, constraint debugging |

### Tier 3 — Deliberately skipped (own the narrative)

| Skipped | Why | Counter-narrative |
|---|---|---|
| GUI-based sketching | Code is the interface | "Your code IS the design history — no hidden state, no rebuild failures" |
| Direct modeling (push/pull) | Not relevant for code-first | "Write `translate(5)` — it's explicit, reproducible, and diffable" |
| Photorealistic rendering | Not a renderer | "Export to glTF and use any renderer. We focus on engineering, not marketing shots." |
| FEM/simulation | Separate domain | "Use your solver of choice. We export clean STEP." |
| CAM/toolpath | Separate domain | "Use your slicer/CAM tool. We export clean geometry." |

## Strategy: How to Be 10x Better

The path to dominance isn't matching every feature 1:1. It's being **so much better in our strengths** that the gaps don't matter, while closing the gaps that actually block adoption.

### Pillar 1: Make 2D Sketches a First-Class Output (Done)

The 2D sketch system is getting increasingly powerful with 36 constraint types, arcs, splines, text, SVG import, regions, and boolean operations. It should be easy to get geometry OUT of sketches, not just into 3D:

- **SVG export** — Any sketch can be exported as clean SVG with proper viewBox, stroke, and fill. Works for laser cutting profiles, web graphics, documentation.
- **DXF export** — Industry standard for CNC, laser cutters, and CAM tools. Polyline-based export from sketch polygons.

### Pillar 2: Close the Remaining Blocking Gaps (Think Big)

1. **BREP-precise fillets/chamfers** — The #1 complaint. Manifold's mesh-based fillets are approximate. The CadQuery/OCCT backend can do exact fillets but the dual-lowering path needs to be robust. Make fillet "just work" with exact radius.

2. **Trim/extend** — Basic sketch editing. Users need to intersect lines and keep one side.

3. **glTF/GLB export** — Three.js has built-in GLTFExporter. Would enable web viewers, AR, and modern 3D pipelines.

### Pillar 3: Double Down on Strengths (Make Them Legendary)

4. **Constraint solver: best-in-class for code-first** — SolveSpace's solver "feels magical." Ours should too. Sub-ms solving, clear error messages, automatic constraint suggestions. The 36 constraint types + shape constraints (area, centroid) are already unique — lean into this.

5. **AI/LLM workflow: prove it with data** — Run benchmarks across models. Publish success rates. Make ForgeCAD THE platform for AI-generated CAD. No competitor can touch this.

6. **Export format king** — Add glTF/GLB, OBJ, IGES. Make ForgeCAD the universal translator. If it goes in, it comes out in any format.

7. **Assembly simulation** — Go beyond static BOM. Animate mechanisms, show motion envelopes, detect interference through full range of motion. SolveSpace does mechanism simulation — we should too, but programmatically.

8. **Performance at scale** — Benchmark with 100+ part assemblies. Optimize. Make "browser-based" not a limitation but an advantage (instant load, no install overhead).

### Pillar 4: Unique Advantages No Competitor Can Match

9. **Programmatic patterns** — Algorithmic geometry (Voronoi, lattice, fractal, topology-optimized infill). No GUI tool can express `for (let i = 0; i < 100; i++) { ... }`.

10. **Batch generation** — Generate 50 variants from a CSV. Export them all. One script. This is impossible in GUI CAD.

11. **Composability** — Import, modify, combine like functions. Version-control the whole thing. CI/CD for CAD.

12. **Notebook workflow** — Jupyter-style iteration for CAD. Pin intermediate results. Debug constraint systems. No competitor has this.

## Priority Ranking

| Priority | Item | Impact on "10x" | Effort | Status |
|---|---|---|---|---|
| P0 | SVG export for 2D sketches | 2D sketch becomes first-class output | Low | **Done** |
| P0 | DXF export for 2D sketches | Unblocks laser cutting/CNC users | Low | **Done** |
| P1 | BREP-precise fillets (via robust CadQuery dual-lowering) | Removes #1 complaint | Hard | Think big |
| P1 | glTF/GLB export | Web viewers, AR, modern pipeline | Low-Medium | Think big |
| P2 | Trim/extend sketch entities | Sketch editing parity | Medium | Think big |
| P2 | Spline constraints | Organic shapes in solver | Medium | Think big |
| P2 | Large assembly benchmarking & optimization | Proves scalability | Medium | Think big |
| P3 | Mechanism simulation (motion envelopes) | Beats SolveSpace at its own game | Hard | Think big |
| P3 | Technical drawings (basic 2D sheets) | Engineering documentation | Hard | Think big |
| P3 | Draft/taper features | Injection molding users | Medium | Think big |

## Files Modified

| File | Purpose |
|---|---|
| `docs/temporary/projects/2026/03/18/competitive-dominance/PLAN.md` | This document |
| `docs/temporary/fusion360-feature-map.md` | Moved to `docs/temporary/projects/2026/02/09/fusion360-feature-mapping/PLAN.md` |
| `src/forge/sketch/exportSvg.ts` | SVG export for 2D sketches |
| `src/forge/sketch/exportDxf.ts` | DXF export for 2D sketches |
| `src/forge/sketch/index.ts` | Re-export new modules |
| `src/forge/forge-public-api.ts` | Expose `exportSketchSvg` and `exportSketchDxf` |
| `src/components/exportActions.ts` | UI export actions for sketch SVG/DXF |

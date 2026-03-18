# ForgeCAD — What It Is and Where It's Going

## The Relationship with Manifold

[Manifold](https://github.com/elalish/manifold) is a geometry kernel. It does boolean operations on triangle meshes, extrusion, revolution, smoothing, and SDF level sets. It's fast, correct, and runs in WASM. Think of it as the engine block.

ForgeCAD is the car built around that engine. Manifold doesn't know what a "rectangle with named sides" is. It doesn't know what a "constraint" is. It doesn't have parameters, sliders, a code editor, or file imports. It gives you raw mesh operations — you give it polygons and get back polygons.

Every serious CAD system has this split:
- Fusion360 uses Parasolid/ACIS as its kernel
- FreeCAD uses OpenCascade
- ForgeCAD uses Manifold

The kernel is not the product. The modeling layer on top is.

## What ForgeCAD Adds Over Manifold

### Already built
- **Constraint solver** — 18 constraint types (coincident, parallel, perpendicular, tangent, equal, symmetric, concentric, collinear, distance, length, angle, radius, diameter, hDistance, vDistance, fixed, horizontal, vertical) with iterative relaxation solver. Detects under/over/fully-constrained states. Live constraint editing in the UI.
- **Named 2D entities** — `Rectangle2D`, `Circle2D`, `Line2D`, `Point2D` with semantic access (`.side('top')`, `.vertex('bottom-left')`, `.pointAtAngle(90)`)
- **Topology tracking** — `TrackedShape` preserves face/edge names through extrusion and translation. `shape.face('top')`, `shape.edge('vert-bl')`, `shape.rotateAroundEdge('top-bottom', 90)`.
- **Sketch primitives** — `roundedRect`, `slot`, `star`, `ngon`, `ellipse`, `polygon`, path builder with stroke
- **Patterns** — `linearPattern`, `circularPattern`, `mirrorCopy` for 3D shape arrays
- **Fillets & chamfers** — `filletCorners()` for selective 2D polygon corners, plus `filletEdge()` / `chamferEdge()` for vertical 3D edges using topology references
- **Arc bridge** — `arcBridgeBetweenRects()` for smooth arc surfaces between rectangular areas (e.g., laptop hinges)
- **Parameters** — `param()` creates live UI sliders, code re-executes on change
- **Multi-file** — `importSketch()`, `importPart()` with circular import detection, folder support
- **Code-as-format** — plain JS/TS files, version-controllable, LLM-writable
- **3D smoothing** — `smoothOut()` + `refine()` / `refineToLength()` / `refineToTolerance()` for edge rounding
- **3D advanced ops** — `hull3d()` (convex hull of shapes + points), `levelSet()` (SDF-based shapes), `warp()`, `split()`, `splitByPlane()`, `trimByPlane()`
- **Sketch on face** — `sketch.onFace(body, face, ...)` places a 2D sketch on canonical or tracked planar faces and extrudes from that face normal
- **Part library** — bolt holes, counterbores, tubes, pipes, hex nuts, rounded boxes, brackets, hole patterns, threaded bolts/nuts (real helical threads via SDF levelSet)
- **Colors** — `.color('#ff0000')` on both Shape and Sketch, preserved through transforms and booleans
- **CLI tools** — SVG export (pure Node), PNG render (Puppeteer), all sharing the same engine via `headless.ts`
- **Measurement tool** — Click-to-measure with vertex/edge/face snapping, draggable markers
- **File management** — File explorer with folders, drag-and-drop, rename, create/delete, unsaved change indicators
- **View controls** — Render modes (solid/wireframe/overlay), projection (perspective/orthographic), named views (front/back/left/right/top/bottom/iso), fit-to-view, zoom-to-selection
- **STL export** — Binary STL export from the browser UI
- **Cut planes** — `cutPlane()` defines named section planes for inspection. Viewport sectioning uses `trimByPlane()` for capped solids, with GPU clipping fallback on trim failures
- **Compile plan inspector** — selecting a shape opens a Construction panel showing its build tree (Union → Box, Cylinder, Fillet, …). Clicking any node previews that sub-shape as an X-ray ghost in the viewport (visible through the parent solid). Navigate with arrow keys; Escape or clicking elsewhere exits.

### Gaps to close (Fusion360 parity)

| Feature | What it does | Why it matters | Difficulty | Status |
|---------|-------------|----------------|------------|--------|
| Arc entity | First-class arc in constraint system | Needed for fillet results to participate in constraints | Medium | **Done** |
| Shell operation | Hollow a solid with wall thickness | Enclosures, cases, containers | Medium | **Done** |
| Per-edge 3D fillet | Round specific edges by exact radius | The #1 most-used Fusion360 operation | Very Hard (mesh kernel) | Exists (mesh-based) |
| Trim/extend | Cut or extend sketch entities at intersections | Complex sketch editing | Medium | |
| Splines | B-spline curves in sketches | Organic shapes | Medium | **Done** (`spline2d`) |
| Loft | Blend between multiple cross-section profiles | Transition shapes, aerodynamic forms | Hard | **Done** (sampled) |
| Thread/helix | Helical sweep for threads, springs | Mechanical fasteners | Medium | Partial (SDF threads) |
| SVG/DXF sketch export | Export 2D sketches for laser/CNC | Fabrication workflows | Low | **Done** |

### What we deliberately skip
- **Editable history tree / timeline** — code IS the history. You read it top to bottom. No need for a separate feature tree when the script is the tree. (Note: the compile plan inspector above is read-only — it shows what the code produced, not a parallel editable feature history.)
- **Direct modeling** — push/pull faces interactively. Not relevant for code-first CAD.
- **Full GUI-style assembly mate solving** — Forge now supports code-level assembly graphs (`assembly()`, revolute/prismatic/fixed joints, collision checks, BOM metadata), but not full interactive face-mate workflows like Fusion's assembly workspace.
- **Photorealistic rendering** — not a rendering tool. Basic viewport materials are sufficient. Export to STL for slicing or external renderers.

## The Code-First Bet

The thesis: parametric CAD expressed as code is strictly more powerful than GUI-based CAD for certain workflows:

1. **LLM generation** — an AI can write and modify `.forge.js` files. It can't click buttons in Fusion360.
2. **Version control** — git diff on a `.forge.js` file shows exactly what changed. Fusion360 files are opaque blobs.
3. **Composition** — import a part, transform it, array it, subtract it. All in code. No manual assembly.
4. **Parametric by default** — every `param()` is a slider. No extra work to make something parametric.
5. **Extensibility** — if you need a new primitive, write a function. No plugin SDK needed.

This doesn't replace Fusion360 for everything. Interactive sketching, direct face manipulation, complex surfacing — those are better with a GUI. But for parametric parts, enclosures, mechanical components, and especially for AI-assisted design, code-first wins.

## Technical Direction

- **Keep Manifold as the kernel.** It's actively maintained, fast, and handles the hard geometry problems. Don't reimplement CSG.
- **Build the parametric layer.** Constraints, named entities, topology tracking, sketch operations — this is where ForgeCAD's value lives.
- **Expose Manifold's power.** Things like `smoothOut`, `refine`, `levelSet` (SDF), `warp` — make them accessible from user scripts with clean APIs.
- **Stay extensible.** Users should be able to define new primitives, new operations, new patterns inside their scripts. The API should be a toolkit, not a cage.
- **Make Forge semantics own the backends.** Manifold and CadQuery/OCCT should be lowerers for the same Forge modeling system, not competing authoring models. See [API/internals/compiler.md](API/internals/compiler.md).

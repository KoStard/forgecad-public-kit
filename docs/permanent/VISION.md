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
- **Constraint solver** — 18 constraint types (coincident, parallel, perpendicular, tangent, equal, distance, angle, etc.) with iterative relaxation solver. Detects under/over-constrained states.
- **Named 2D entities** — `Rectangle2D`, `Circle2D`, `Line2D`, `Point2D` with semantic access (`.side('top')`, `.vertex('bottom-left')`)
- **Topology tracking** — `TrackedShape` preserves face/edge names through extrusion and translation. You can write `shape.face('top')` or `shape.edge('vert-bl')`.
- **Sketch primitives** — `roundedRect`, `slot`, `star`, `ngon`, `ellipse`, `polygon`, path builder with stroke
- **Patterns** — `linearPattern`, `circularPattern`, `mirrorCopy`
- **Parameters** — `param()` creates live UI sliders, code re-executes on change
- **Multi-file** — `importSketch()`, `importPart()` with circular import detection
- **Code-as-format** — plain JS/TS files, version-controllable, LLM-writable
- **3D smoothing** — `smoothOut()` + `refine()` for edge rounding (exposed from Manifold)
- **Part library** — bolt holes, counterbores, tubes, pipes, hex nuts, brackets

### Gaps to close (Fusion360 parity)

| Feature | What it does | Why it matters | Difficulty |
|---------|-------------|----------------|------------|
| 2D sketch fillet | Insert tangent arc at path corners | Custom rounded profiles without `roundedRect` | Medium |
| Arc entity | First-class arc in constraint system | Needed for fillet results to participate in constraints | Medium |
| Shell operation | Hollow a solid with wall thickness | Enclosures, cases, containers | Medium |
| Sketch on face | Project sketch onto a 3D face, extrude from it | Feature placement on existing geometry | Hard |
| Per-edge 3D fillet | Round specific edges by exact radius | The #1 most-used Fusion360 operation | Very Hard (mesh kernel limitation) |
| Trim/extend | Cut or extend sketch entities at intersections | Complex sketch editing | Medium |
| Splines | B-spline curves in sketches | Organic shapes | Medium |

### What we deliberately skip
- **History tree / timeline** — code IS the history. You read it top to bottom. No need for a separate feature tree when the script is the tree.
- **Direct modeling** — push/pull faces interactively. Not relevant for code-first CAD.
- **Assembly constraints** — mates, joints. Could add later but not core to the code-first approach.
- **Rendering / materials** — not a rendering tool. Export to STL and use a slicer or renderer.

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

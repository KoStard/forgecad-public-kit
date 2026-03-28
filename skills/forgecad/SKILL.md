---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when building or modifying ForgeCAD geometry, structuring multi-file projects, running notebook cells, validating scripts, or using ForgeCAD export/render tooling.
---

# ForgeCAD

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: `.forge.js`, `.forge-notebook.json`, SVG asset, or CLI/export task.
2. Load only the docs the task needs (see Source Map below). Start from the top group, add others as needed.
3. Reuse patterns from `examples/api/` before inventing from scratch.
4. Default to a concrete first pass — easy iteration beats speculative design review.
5. If an existing model is broken, replace the weak structure rather than preserving bad architecture.
6. Validate with `npm run test-run -- <file>` (add `--debug-imports` for import chain issues).
7. For `jointsView()` animations, keep wrapped revolute tracks continuous across branch cuts; do not assume the viewport will auto-fix `-180/180` jumps.

### Import and Composition

- `require("./file.forge.js", { Param: value })` for any model file, with optional param overrides.
- `importSvgSketch()` for SVG files (file format loader, not a module import).
- `.withReferences()` + `.placeReference()` for reusable placement.
- Plain `.js` modules for shared helpers/constants (not model imports).

### Notebooks

Use `.forge-notebook.json` for stateful iteration and debugging. Cells share state, `show()` pins visible geometry. Export to `.forge.js` when done.

## Source Map

Load groups top-to-bottom, stopping when you have what the task needs.

### 1. Core API (always read first)

Execution model, colors, coordinate system, primitives, booleans, patterns, imports, parameters, topology, edge queries.

- `docs/permanent/API/core/concepts.md`
- `docs/permanent/API/core/parameters.md`
- `docs/permanent/API/core/topology.md`
- `docs/permanent/API/core/edge-queries.md`
- `docs/permanent/generated/core.md`

### 2. Geometry and Positioning (when placement/orientation matters)

Axis conventions, winding rules, and placement strategy.

- `docs/permanent/guides/coordinate-system.md`
- `docs/permanent/guides/geometry-conventions.md`
- `docs/permanent/guides/positioning.md`

### 3. Sketch APIs (when the task is sketch-heavy)

2D construction, transforms, booleans, paths, on-face sketching, extrusion, anchors, text, regions.

- `docs/permanent/API/sketch/core.md`
- `docs/permanent/API/sketch/primitives.md`
- `docs/permanent/API/sketch/path.md`
- `docs/permanent/API/sketch/transforms.md`
- `docs/permanent/API/sketch/booleans.md`
- `docs/permanent/API/sketch/operations.md`
- `docs/permanent/API/sketch/on-face.md`
- `docs/permanent/API/sketch/extrude.md`
- `docs/permanent/API/sketch/anchor.md`
- `docs/permanent/API/sketch/text.md`
- `docs/permanent/API/sketch/regions.md`
- `docs/permanent/generated/sketch.md`

### 4. Curves and Surfacing (for lofts, sweeps, splines)

Smooth curves, Hermite splines, lofted and swept solids.

- `docs/permanent/generated/curves.md`

### 5. Assemblies and Mechanisms (for joints or kinematics)

Assembly graph, joint types, couplings, validation, robot export.

- `docs/permanent/API/assembly/assembly.md`
- `docs/permanent/generated/assembly.md`

### 6. Sheet Metal (for bent parts, K-factor, flat patterns)

Bend operations, flat pattern unfolding, K-factor configuration.

- `docs/permanent/API/sheet-metal/sheet-metal.md`
- `docs/permanent/generated/sheet-metal.md`

### 7. Output and Export (for STL/3MF/STEP, BOM, dimensions)

Mesh export, exact geometry export, bill of materials, dimension annotations.

- `docs/permanent/API/output/export.md`
- `docs/permanent/API/output/brep-export.md`
- `docs/permanent/API/output/bom.md`
- `docs/permanent/API/output/dimensions.md`
- `docs/permanent/generated/output.md`

### 8. Toolbox (fasteners and standard parts)

Parametric bolts, nuts, washers, standard hardware, gears, pipes, and structural profiles.

- `docs/permanent/API/toolbox/fasteners.md`
- `docs/permanent/generated/lib.md`

### 9. Runtime Viewport APIs (for cut planes, jointsView, and animation playback)

Viewer-only APIs such as cutPlane, explodeView, jointsView, and animation behavior.

- `docs/permanent/API/runtime/viewport.md`
- `docs/permanent/generated/viewport.md`

### 10. Recipes and Debugging (for patterns and troubleshooting)

Modeling patterns, debugging tactics, copyable snippets.

- `docs/permanent/guides/modeling-recipes.md`

### 11. CLI (for validation/render/export tasks)

Test-run, notebook execution, export pipelines, debug flags.

- `docs/permanent/CLI.md`

### 12. Check API examples for more context

- `examples/api/*`

---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, SVG-import, assembly, and CLI workflows. Use when building or modifying ForgeCAD geometry, structuring multi-file projects, validating scripts, or using ForgeCAD export/render tooling.
forgecad-public: true
---

# ForgeCAD

Author or modify ForgeCAD models, sketches, assemblies, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: `.forge.js`, SVG asset, or CLI/export task.
2. **If the model has any moving parts, load the `assembly` group AND the `joint-design.md` recipe upfront** — do not defer the kinematic structure to a refactor pass.
3. Load only the docs the task needs (see Source Map below). Start from the top group, add others as needed.
4. If any two parts are intended to touch or mate in the final model, load the positioning guide immediately and default to connectors + `matchTo()`.
5. Default to a concrete first pass — easy iteration beats speculative design review.
6. If an existing model is broken, replace the weak structure rather than preserving bad architecture.
7. Validate with `forgecad run <file>` (add `--debug-imports` for import chain issues, and pass `--backend manifold|occt|truck` when the backend matters).
8. For `jointsView()` animations, keep wrapped revolute tracks continuous across branch cuts; do not assume the viewport will auto-fix `-180/180` jumps.
9. Model the physical artifact, not an educational diagram. Do not add explanatory labels, arrows, legends, or text plaques unless the user explicitly asks for a presentation or teaching view. Product markings are allowed only when they would exist on the real object.
10. Build the real closed CAD first. Do not bake cutaways, sectioned shells, permanently exploded layouts, or hidden-parts views into the default model just to show internals. Use viewer-only cut planes, `explodeView`, object hiding, transparency, or `inspect sections` after the artifact exists.

### Import and Composition

- Always include the extension in relative imports: `require("./file.forge.js", { Param: value })` for model files and `require("./helpers.js")` for plain helper modules. Do not write extensionless imports such as `require("./file")`; ForgeCAD resolves project imports by exact path.
- ForgeCAD APIs are injected globals in `.forge.js` files. Use `bom()`, `box()`, `scene()`, `Shape`, etc. directly; do not destructure those names from helpers with patterns like `const { bom } = require("./bom.js")`. If a helper file is needed, import it under a project-specific name such as `const bomHelpers = require("./bom.js")`.
- For static multi-part models, connectors + `matchTo()` are the default way to assemble touching parts.
- Top-level scripts can return `Assembly` or `SolvedAssembly` directly. Do not call `.toGroup()` just to render an assembly; use `.toGroup()` only when you need `ShapeGroup` composition, transforms, or named-child lookup.
- `importSvgSketch()` for SVG files (file format loader, not a module import).
- `.placeReference('bottom', [0,0,0])` to align any built-in anchor to a world coordinate; also works with custom `.withReferences()`.
- Plain `.js` modules for shared helpers/constants (not model imports).

## Source Map

Load groups top-to-bottom, stopping when you have what the task needs.

### 1. Core API (always read first)

Execution model, colors, coordinate system, primitives, booleans, patterns, imports, parameters, topology, edge queries.

- `{{SKILL_DIR}}/docs/API/core/concepts.md`
- `{{SKILL_DIR}}/docs/generated/core.md`

### 2. Static Assembly and Positioning (for any multi-part model)

Axis conventions, winding rules, and placement strategy. If parts should touch in the final model, read this group before writing placement code. Connectors + `matchTo()` are the default for mating interfaces; raw `translate()` and `rotate()` are for free offsets, not assembly contracts.

- `{{SKILL_DIR}}/docs/guides/coordinate-system.md`
- `{{SKILL_DIR}}/docs/guides/geometry-conventions.md`
- `{{SKILL_DIR}}/docs/guides/positioning.md`

### 3. Sketch APIs

2D construction, transforms, booleans, paths, on-face sketching, extrusion, anchors, text, regions.

- `{{SKILL_DIR}}/docs/generated/sketch.md`

### 4. Curves and Surfacing (for lofts, sweeps, splines)

Smooth curves, Hermite splines, lofted and swept solids. For straps, inlays, guards, brace members, vents, or physical bands that live on a carrier surface, use `Carrier` + `SurfaceBody` surface-member primitives before reaching for `variableSweep`, SDF sculpting, or manual boolean overlap recipes.

- `{{SKILL_DIR}}/docs/generated/curves.md`

### 5. Assemblies and Mechanisms (for joints or kinematics)

Assembly graph, joint types, couplings, validation, robot export.

- `{{SKILL_DIR}}/docs/generated/assembly.md`

### 6. Sheet Metal (for bent parts, K-factor, flat patterns)

Bend operations, flat pattern unfolding, K-factor configuration.

- `{{SKILL_DIR}}/docs/generated/sheet-metal.md`

### 7. Output and Export (for STL/3MF/STEP, BOM, dimensions)

Mesh export, exact geometry export, bill of materials, dimension annotations.

- `{{SKILL_DIR}}/docs/generated/output.md`

### 8. Toolbox (fasteners and standard parts)

Parametric bolts, nuts, washers, standard hardware, gears, pipes, and structural profiles.

- `{{SKILL_DIR}}/docs/generated/lib.md`
- `{{SKILL_DIR}}/docs/generated/wood.md`

### 9. Runtime Viewport APIs (for cut planes, exploded views, hiding, and animation playback)

Viewer-only APIs such as cutPlane, explodeView, jointsView, and animation behavior.

- `{{SKILL_DIR}}/docs/generated/viewport.md`

### 10. Recipes and Debugging (for patterns and troubleshooting)

Modeling patterns, debugging tactics, copyable snippets.

- `{{SKILL_DIR}}/docs/guides/modeling-recipes.md`
- `{{SKILL_DIR}}/docs/guides/joint-design.md`

### 11. CLI (for validation/render/export tasks)

Test-run, export pipelines, debug flags.

- `{{SKILL_DIR}}/docs/CLI.md`
- `{{SKILL_DIR}}/docs/guides/inspection-bundles.md`

### SDF Modeling (smooth booleans, TPMS, deformations, fromFunction)

Primitives, smooth booleans, TPMS lattices, twist/bend/displace, morph, custom functions, gotchas. SDF is inherently implicit and sampled, not B-rep/exact geometry; use caution for precision-critical parts and exact export workflows.

- `{{SKILL_DIR}}/docs/generated/sdf.md`

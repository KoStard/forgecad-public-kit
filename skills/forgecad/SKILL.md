---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .sketch.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when Codex needs to build or modify ForgeCAD geometry, structure multi-file projects, run notebook cells, validate scripts, or use ForgeCAD export/render tooling.
---

# ForgeCAD

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: `.forge.js`, `.sketch.js`, `.forge-notebook.json`, SVG asset, or CLI/export task.
2. Load only the docs the task needs (see Source Map below). Start from the top group, add others as needed.
3. Reuse patterns from `examples/api/` before inventing from scratch.
4. Default to a concrete first pass — easy iteration beats speculative design review.
5. If an existing model is broken, replace the weak structure rather than preserving bad architecture.
6. Validate with `npm run test-run -- <file>` (add `--debug-imports` for import chain issues).
7. For `jointsView()` animations, keep wrapped revolute tracks continuous across branch cuts; do not assume the viewport will auto-fix `-180/180` jumps.

### Import and Composition

- `importPart()` for parts, `importSketch()` for sketches/SVGs, with explicit `paramOverrides`.
- `.withReferences()` + `.placeReference()` for reusable placement.
- Plain `.js` modules for shared helpers/constants (not model imports).

### Notebooks

Use `.forge-notebook.json` for stateful iteration and debugging. Cells share state, `show()` pins visible geometry. Export to `.forge.js` when done.

## Source Map

Load groups top-to-bottom, stopping when you have what the task needs.

### 1. Core API (always read first)

Primitives, transforms, booleans, imports, topology, return formats, curves/surfacing.

- `docs/permanent/API/model-building/reference.md`

### 2. Geometry and Positioning (when placement/orientation matters)

Axis conventions, winding rules, and placement strategy.

- `docs/permanent/API/model-building/coordinate-system.md`
- `docs/permanent/API/model-building/geometry-conventions.md`
- `docs/permanent/API/model-building/positioning.md`

### 3. Sketch APIs (when the task is sketch-heavy)

2D construction, transforms, booleans, paths, on-face sketching, extrusion, anchors.

- `docs/permanent/API/model-building/sketch-core.md`
- `docs/permanent/API/model-building/sketch-primitives.md`
- `docs/permanent/API/model-building/sketch-path.md`
- `docs/permanent/API/model-building/sketch-transforms.md`
- `docs/permanent/API/model-building/sketch-booleans.md`
- `docs/permanent/API/model-building/sketch-operations.md`
- `docs/permanent/API/model-building/sketch-on-face.md`
- `docs/permanent/API/model-building/sketch-extrude.md`
- `docs/permanent/API/model-building/sketch-anchor.md`

### 4. Entities and Topology (for tracked references, constraints, patterns)

Named entities, tracked 3D topology, constraints, patterns, fillet/chamfer helpers.

- `docs/permanent/API/model-building/entities.md`

### 5. Assemblies and Mechanisms (for joints or kinematics)

Assembly graph, joint types, couplings, validation, robot export.

- `docs/permanent/API/model-building/assembly.md`

### 6. Runtime Viewport APIs (for cut planes, jointsView, and animation playback)

Viewer-only APIs such as cutPlane, explodeView, jointsView, and animation behavior.

- `docs/permanent/API/runtime/viewport.md`

### 7. Recipes and Debugging (for patterns and troubleshooting)

Modeling patterns, debugging tactics, copyable snippets.

- `docs/permanent/API/guides/modeling-recipes.md`

### 8. CLI and Exports (for validation/render/export tasks)

Test-run, notebook execution, export pipelines, debug flags.

- `docs/permanent/CLI.md`


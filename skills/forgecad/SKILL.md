---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .sketch.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when Codex needs to build or modify ForgeCAD geometry, structure multi-file projects, run notebook cells, validate scripts, or use ForgeCAD export/render tooling.
---

# ForgeCAD

## Overview

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows using the mapped source docs below. Prefer documented ForgeCAD primitives, import rules, placement strategies, and CLI commands over inventing new APIs or geometry conventions.

## Workflow

1. Identify the target artifact first: `.forge.js`, `.sketch.js`, `.forge-notebook.json`, SVG asset, or a CLI/export task.
2. Default to a concrete first pass when the user clearly wants a fix or a model, not a long design review. Easy iteration is cheaper than speculative back-and-forth.
3. Use the read plan below to load only the docs needed for the current task. Avoid bulk-reading everything.
4. If an existing model is broken or incoherent, replace the weak structure with a cleaner buildable design instead of preserving bad architecture.
5. Use multi-file imports deliberately: `importPart()` for parts, `importSketch()` for sketches or SVGs, explicit `paramOverrides`, and `.withReferences()` plus `.placeReference()` for reusable placement.
6. Use notebooks when the task benefits from stateful iteration, iterative development or debugging; remember cells share state, `show()` pins visible geometry, and notebooks can be exported to plain `.forge.js`. You can later convert it to a forge.js file.
7. Validate quickly through the CLI with `npm run test-run -- <file>`; add `--debug-imports` when import chains or overrides might be wrong, then refine from the runtime result.
8. Reuse patterns from `examples/api/` before inventing a modeling recipe from scratch.

## Read Plan (Anti-Redundancy)

1. Start with `docs/permanent/API/model-building/reference.md` for API correctness.
2. Only add `docs/permanent/API/model-building/coordinate-system.md`, `docs/permanent/API/model-building/geometry-conventions.md`, and `docs/permanent/API/model-building/positioning.md` when orientation or placement behavior matters.
3. Load sketch docs selectively based on what the task touches (primitives, paths, booleans, transforms, on-face, extrusion, anchors).
4. Load `docs/permanent/API/model-building/assembly.md` only when joints, couplings, or mechanism validation are involved.
5. Load `docs/permanent/API/model-building/entities.md` for topology-aware edits, constraints, and feature propagation.
6. Use `docs/permanent/API/guides/modeling-recipes.md` for practical patterns and debugging tactics.
7. Use `docs/permanent/CLI.md` for command usage, export pipelines, and runtime checks.

## Source Map

### Core API (read first)

Single source of truth for primitives, transforms, booleans, imports, topology, and return formats.

- `docs/permanent/API/model-building/reference.md`

### Geometry and Positioning (load when placement/orientation matters)

Conventions and preferred placement strategy to avoid axis mistakes, winding errors, and fragile manual offsets.

- `docs/permanent/API/model-building/coordinate-system.md`
- `docs/permanent/API/model-building/geometry-conventions.md`
- `docs/permanent/API/model-building/positioning.md`

### Sketch Deep-Dives (load only when the task is sketch-heavy)

Focused docs for sketch construction, transformations, booleans, path workflows, and sketch-to-solid conversion.

- `docs/permanent/API/model-building/sketch-core.md`
- `docs/permanent/API/model-building/sketch-primitives.md`
- `docs/permanent/API/model-building/sketch-path.md`
- `docs/permanent/API/model-building/sketch-transforms.md`
- `docs/permanent/API/model-building/sketch-booleans.md`
- `docs/permanent/API/model-building/sketch-operations.md`
- `docs/permanent/API/model-building/sketch-on-face.md`
- `docs/permanent/API/model-building/sketch-extrude.md`
- `docs/permanent/API/model-building/sketch-anchor.md`

### Assemblies and Mechanisms (load for joints or kinematics)

Assembly graph, couplings, metadata, and robot export behavior.

- `docs/permanent/API/model-building/assembly.md`

### Entity and Topology Helpers (load for tracked references or constraints)

2D entities, tracked 3D topology, constraints, patterns, and edge fillet/chamfer helpers.

- `docs/permanent/API/model-building/entities.md`

### Recipes and Debugging (load for faster iteration and examples)

Modeling patterns, troubleshooting moves, and copyable snippets.

- `docs/permanent/API/guides/modeling-recipes.md`

### CLI and Exports (load for validation/render/export tasks)

Notebook execution, test-run validation, export pipelines, and debug flags.

- `docs/permanent/CLI.md`


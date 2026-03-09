# Model-Building Docs

This folder is partitioned so each API surface has one primary owner file. Avoid reading everything by default; load only what the current task needs.

## Ownership

- [reference.md](reference.md): core script contract, 3D primitives/transforms, booleans, imports, library helpers, return formats, and curves/surfacing APIs.
- [coordinate-system.md](coordinate-system.md), [geometry-conventions.md](geometry-conventions.md), [positioning.md](positioning.md): orientation rules, winding/transform conventions, and placement strategy.
- [sketch-core.md](sketch-core.md), [sketch-primitives.md](sketch-primitives.md), [sketch-path.md](sketch-path.md), [sketch-transforms.md](sketch-transforms.md), [sketch-booleans.md](sketch-booleans.md), [sketch-operations.md](sketch-operations.md), [sketch-on-face.md](sketch-on-face.md), [sketch-extrude.md](sketch-extrude.md), [sketch-anchor.md](sketch-anchor.md): detailed 2D sketch APIs.
- [entities.md](entities.md): named entities, tracked topology, constrained sketches, patterns, and fillet/chamfer utilities.
- [assembly.md](assembly.md): assembly graph, joints, couplings, validation, and robot export behavior.

## Read Plan

1. Start with [reference.md](reference.md) plus [coordinate-system.md](coordinate-system.md), [geometry-conventions.md](geometry-conventions.md), and [positioning.md](positioning.md).
2. Add sketch docs only when the task is sketch-heavy.
3. Add [entities.md](entities.md) for topology-aware edits, constraints, or pattern helpers.
4. Add [assembly.md](assembly.md) only for joint/coupling/mechanism work.
5. Pull in guides and CLI docs only when you need recipes, troubleshooting, or command usage.

## Intentionally Excluded

These files are still part of the ForgeCAD API, but they are not required for baseline model building:

- `../runtime/` for viewport-only behavior
- `../output/` for reporting/export behavior
- `../guides/` for recipes and troubleshooting
- `../internals/` for engine notes

# ForgeCAD API Docs

This folder is split by purpose so model-building guidance stays separate from adjacent runtime, output, and internal material.

## Canonical Read Path for Model Building

If an AI agent or contributor needs everything required to write or modify ForgeCAD models, read:

1. [model-building/README.md](model-building/README.md)
2. Every file listed there, in order
3. Relevant runnable examples in `examples/api/`

That `model-building/` set is the complete script-authoring surface for geometry and assemblies.

## Adjacent API Areas

- [runtime/viewport.md](runtime/viewport.md): viewport-only controls such as cut planes, exploded-view overrides, runtime joints, and helper overlays
- [output/bom.md](output/bom.md): BOM/report metadata APIs
- [output/dimensions.md](output/dimensions.md): dimension annotations for viewport/report output
- [output/brep-export.md](output/brep-export.md): exact STEP/BREP export parity matrix
- [guides/modeling-recipes.md](guides/modeling-recipes.md): patterns, best practices, debugging, and example snippets

Read those only when the task explicitly involves that area.

# Model-Building Docs

This is the complete reading set for writing ForgeCAD models. If the task is "build or modify a model", read every file below before coding.

## Required Files

1. [reference.md](reference.md) - core script contract, 3D API, imports, library helpers, return formats
2. [coordinate-system.md](coordinate-system.md) - axis conventions and standard views
3. [geometry-conventions.md](geometry-conventions.md) - winding, transform order, revolve axis, frame composition
4. [positioning.md](positioning.md) - preferred placement strategy for parts and sketches
5. [entities.md](entities.md) - named 2D entities, tracked topology, fillet/chamfer helpers, patterns
6. [assembly.md](assembly.md) - assembly graphs, joints, couplings, sweep/collision validation
7. [sketch-core.md](sketch-core.md) - `Sketch` basics, queries, anchors
8. [sketch-primitives.md](sketch-primitives.md) - `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`
9. [sketch-path.md](sketch-path.md) - path builder and stroke generation
10. [sketch-transforms.md](sketch-transforms.md) - 2D transforms
11. [sketch-booleans.md](sketch-booleans.md) - sketch boolean operations
12. [sketch-operations.md](sketch-operations.md) - offset, selective sketch fillets, hull, simplify, warp
13. [sketch-on-face.md](sketch-on-face.md) - attach sketches to standard 3D faces
14. [sketch-extrude.md](sketch-extrude.md) - extrusion and revolve
15. [sketch-anchor.md](sketch-anchor.md) - 2D anchor-based positioning

## Intentionally Excluded

These files are still part of the ForgeCAD API, but they are not required for baseline model building:

- `../runtime/` for viewport-only behavior
- `../output/` for reporting/export behavior
- `../guides/` for recipes and troubleshooting
- `../internals/` for engine notes

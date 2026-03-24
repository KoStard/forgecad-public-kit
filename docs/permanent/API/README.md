# ForgeCAD API Documentation

This directory contains **hand-written API guides** for model authors. For a complete auto-generated function/class index, see [`generated/api-reference.md`](../generated/api-reference.md).

## Directory Layout

| Directory | Audience | What's in it |
|-----------|----------|-------------|
| `core/` | Model authors | Core reference: primitives, transforms, booleans, imports, parameters, topology |
| `sketch/` | Model authors (sketch-heavy tasks) | 2D sketch construction, transforms, booleans, on-face, extrude |
| `assembly/` | Model authors (mechanisms) | Assembly graph, joints, couplings, kinematics |
| `sheet-metal/` | Model authors (folded parts) | Sheet metal, flanges, flat patterns |
| `runtime/` | Model authors (viewport) | Cut planes, exploded views, joint controls |
| `output/` | Model authors (export/reports) | BOM, dimensions, G-code toolpaths, mesh export, STEP/BREP export |
| `toolbox/` | Model authors (library) | Fasteners, hardware helpers |

## Read Plan

> Load only what the current task needs. Start from the top, add docs as needed.

1. **Always start with** `core/reference.md` — the core script contract
2. **For geometry orientation**: `../guides/coordinate-system.md`, `../guides/geometry-conventions.md`, `../guides/positioning.md`
3. **For sketch-heavy work**: `sketch/*.md` (9 files covering 2D APIs)
4. **For topology/constraints**: `core/topology.md`
5. **For assemblies**: `assembly/assembly.md`
6. **For sheet metal**: `sheet-metal/sheet-metal.md`
7. **For viewport controls**: `runtime/viewport.md`
8. **For recipes/debugging**: `../guides/modeling-recipes.md`
9. **For CLI/export**: `../cli.md`, `output/*.md`

## Adjacent Documentation

- **[`../generated/api-reference.md`](../generated/api-reference.md)** — Auto-generated complete API index (run `npm run gen:docs` to refresh)
- **[`../guides/`](../guides/)** — Conceptual orientation: coordinate system, conventions, recipes
- **[`../internals/`](../internals/)** — Engine internals for ForgeCAD contributors
- **[`../project/`](../project/)** — Development workflow, coding standards, deployment
- **[`../cli.md`](../cli.md)** — CLI reference

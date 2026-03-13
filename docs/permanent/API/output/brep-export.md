# BREP Export Parity

This file tracks exact STEP/BREP export support. It is intentionally separated from the model-building docs because it describes output coverage, not the authoring surface itself.

This table is the source of truth for ForgeCAD exact STEP/BREP export support.

Update it whenever:
- a Forge operation becomes exactly exportable
- support becomes partial or regresses
- a planned feature moves to implemented

## Current Backend

- Export executor: `uv run cli/forge-brep-export.py`
- Compiler target: `cadquery-occt`
- Exact kernel backend: CadQuery on OpenCascade
- Default export policy: exact-subset only, never silent mesh-to-fake-BREP conversion
- Optional CLI fallback: `--allow-faceted` exports closed mesh solids as explicit faceted OCCT solids for STEP/BREP; this is not exact replay

## Parity Table

| Forge Feature | Status | Exact Export | Notes |
| --- | --- | --- | --- |
| `box()` | Supported | Yes | Native OCCT solid replay |
| `cylinder()` | Supported | Yes | Straight cylinder and cone-style `radiusTop` replay |
| `sphere()` | Supported | Yes | Native OCCT solid replay |
| `rect()` | Supported | Yes | As a profile for supported extrude/revolve flows |
| `circle2d()` | Supported | Yes | As a profile for supported extrude/revolve flows |
| `roundedRect()` | Supported | Yes | Replayed as an exact rounded wire/profile |
| `rect(...).translate()` | Supported | Yes | Recorded as profile transforms |
| `circle2d(...).translate()` | Supported | Yes | Recorded as profile transforms |
| `roundedRect(...).translate()` | Supported | Yes | Recorded as profile transforms |
| `rect(...).rotate()` | Supported | Yes | Recorded as profile transforms |
| `circle2d(...).rotate()` | Supported | Yes | Recorded as profile transforms |
| `roundedRect(...).rotate()` | Supported | Yes | Recorded as profile transforms |
| `rect/circle/roundedRect.scale(...)` | Supported | Yes | Recorded as exact affine profile transforms |
| `polygon()` / `ngon()` / polygon-backed `ellipse()` / `star()` | Supported | Yes | Replayed as exact line-segment profiles from recorded point loops |
| `slot()` | Supported | Yes | Built from exact rect/circle booleans |
| Sketch booleans (`union2d`, `difference2d`, `intersection2d`) | Supported | Yes | Only when every child profile is exact-exportable |
| `rect/circle/roundedRect.extrude(height)` | Supported | Yes | `twist` / `divisions` must be absent |
| `rect/circle/roundedRect.extrude(height, { scaleTop })` | Supported | Yes | Replayed as exact lofts; sketch booleans are decomposed into 3D booleans when needed |
| `rect/circle/roundedRect.revolve(degrees)` | Supported | Yes | Replayed around Forge's revolve axis convention |
| `Sketch.offset(delta, 'Round')` | Partial | Yes | Exact round-offset replay for exact-exportable profiles; `Square` / `Miter` still drop the plan |
| `shape.translate()` | Supported | Yes | Recorded as exact solid transform |
| `shape.rotate(x, y, z)` | Supported | Yes | Euler replay only |
| `shape.scale(v)` | Supported | Yes | Recorded as an exact affine solid transform when every scale factor is finite and non-zero |
| `rotateAround(...)` | Supported | Yes | Exact arbitrary-axis rotation is recorded with axis + pivot |
| `pointAlong(...)` | Supported | Yes | Replayed via exact arbitrary-axis rotation from Forge's +Z axis |
| `mirror(...)` | Supported | Yes | Replayed as an exact mirror transform across the origin plane normal |
| `Shape.transform(matrix)` | Partial | Yes | Rigid affine subset only: orthonormal rotation + translation; scale/shear/perspective still unsupported |
| `union()` | Supported | Yes | Only when every operand is exact-exportable |
| `difference()` | Supported | Yes | Only when every operand is exact-exportable |
| `intersection()` | Supported | Yes | Only when every operand is exact-exportable |
| `split(cutter)` | Supported | Yes | Replayed as the exact pair `intersection(base, cutter)` and `difference(base, cutter)` when both operands are exact-exportable |
| Returned multi-object scene | Supported | Yes | Exported as a STEP/BREP compound |
| Returned mixed sketch + solid scene | Supported | Yes | Exact solids export; sketch-only objects are skipped with a warning |
| Sketch `mirror()` | Supported | Yes | Recorded as an exact profile reflection across the origin line normal |
| `loft()` | Partial | Yes | Forge now records loft intent in the compile graph and exports compatible section stacks through CadQuery/OCCT lofting, but runtime preview remains sampled/level-set and some mixed-topology stacks can still exceed OCCT loft compatibility |
| `sweep()` | Partial | Yes | Forge now records sweep intent in the compile graph and exports compile-covered profiles along the canonical sampled polyline path; runtime preview remains sampled/level-set and `Curve3D` paths export through that sampled path representation |
| `levelSet()` | Unsupported | No | Mesh/SDF output by design |
| `smoothOut()` / `refine*()` / `simplify()` | Unsupported | No | Mesh post-processing, not exact BREP |
| `warp()` | Unsupported | No | Deformation is mesh-domain today |
| `hull3d()` / `Shape.hull()` / `hull2d()` / `Sketch.hull()` | Partial | No | Hull intent is now preserved in the Forge compile graph and reported explicitly, but there is still no exact convex-hull OCCT replay; `--allow-faceted` can export closed hull solids as faceted geometry |
| `trimByPlane()` / `splitByPlane()` | Supported | Yes | Replayed through an exact plane half-space trim in CadQuery/OCCT; `splitByPlane()` lowers to the pair of positive-side and opposite-side trims |
| `Shape.hole()` | Partial | Yes | Circular through/blind holes plus counterbores, countersinks, and planar `upToFace` termination on supported face-query targets now replay exactly; patterned, drafted/two-sided, threaded, and combined counterbore+countersink workflows are still outside the defended subset |
| `Shape.cutout()` | Partial | Yes | Sketch must already be placed with `onFace(...)`; blind/through and planar `upToFace` cut extents on defended face-query targets stay exact, but drafted, two-sided, and pattern-owned cut workflows are still unsupported |
| `sheetMetal(...).folded()` / `sheetMetal(...).flatPattern()` | Supported | Yes | Compiler-owned v1 sheet-metal subset: base panel, up to four `90°` edge flanges, explicit thickness/radius/K-factor, rectangular corner reliefs, and planar panel/flange cutouts all replay exactly from one semantic model; arbitrary solid conversion, hems, jogs, lofted bends, bend cutouts, and nonuniform thickness remain unsupported |
| `projectToPlane()`-driven downstream features | Partial | Yes | Exact replay is supported when the source reduces to one defended planar basis: straight placed extrusions, compatible shell/hole/cut descendants, and compatible boolean unions on matching parallel target planes; boolean difference/intersection, trim/fillet/chamfer silhouette changes, and non-parallel bases still reject with diagnostics |
| `Shape.shell(thickness, { openFaces })` | Partial | Yes | Compiler-owned shell v1 rewrites compatible `box()`, `cylinder()`, and straight `extrude()` bases plus rigid transforms into exact boolean/extrude/cylinder plans; tapered extrudes, scale transforms, and general boolean/revolve/loft/sweep/hull/trim bases are still unsupported |
| `filletEdge()` / `chamferEdge()` | Partial | Yes | Compiler-owned tracked-edge subset: vertical edges from compile-covered `box()` bodies and `rectangle(...).extrude(...)` flows, plus preserved propagated sibling edges after earlier supported edge-finish rewrites when a later supported boolean union still records one defended lineage; shell, hole/cut, boolean difference/intersection, unsupported unions, and the already-finished merged edge itself are still outside the defended exact subset |
| `TrackedShape` topology preservation | Partial | Synthetic only | Export succeeds for supported base solids, but named topology is not written to STEP/BREP |
| Colors/materials in STEP/BREP | Partial | STEP only | Scene-object colors are written to STEP via CadQuery assembly export; `.brep` remains geometry-only |
| STEP assembly structure/BOM metadata | Partial | Names only | STEP export writes a flat scene-object assembly to preserve names/colors; Forge assembly/BOM metadata is still not exported |

The current defended exact subset is exercised by the ordinary-parts corpus in [`examples/compiler-corpus/README.md`](../../../../examples/compiler-corpus/README.md).

## Planned Expansion Order

1. Exact provenance-preserving replay for library helpers such as `lib.elbow()`, `lib.bolt()`, and related fastener/tube builders
2. Safe exact affine scale replay where OCCT can preserve exact solids, especially scaled-sphere / pad workflows
3. Broader exact OCCT-native feature coverage where BREP matters most: wider `shell()` coverage, broader fillet/chamfer coverage, richer face-driven feature ops
4. Optional STEP product structure and metadata export

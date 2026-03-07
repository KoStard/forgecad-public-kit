# BREP Export Parity

This file tracks exact STEP/BREP export support. It is intentionally separated from the model-building docs because it describes output coverage, not the authoring surface itself.

This table is the source of truth for ForgeCAD exact STEP/BREP export support.

Update it whenever:
- a Forge operation becomes exactly exportable
- support becomes partial or regresses
- a planned feature moves to implemented

## Current Backend

- Export executor: `uv run cli/forge-brep-export.py`
- Exact kernel backend: CadQuery on OpenCascade
- Export policy: exact-subset only, never mesh-to-fake-BREP conversion

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
| Returned multi-object scene | Supported | Yes | Exported as a STEP/BREP compound |
| Returned mixed sketch + solid scene | Supported | Yes | Exact solids export; sketch-only objects are skipped with a warning |
| Sketch `mirror()` | Supported | Yes | Recorded as an exact profile reflection across the origin line normal |
| arbitrary `warp()` | Unsupported | No | Not recorded in export plan |
| `loft()` | Unsupported | No | Current Forge implementation is sampled/level-set |
| `sweep()` | Unsupported | No | Current Forge implementation is sampled/level-set |
| `levelSet()` | Unsupported | No | Mesh/SDF output by design |
| `smoothOut()` / `refine*()` / `simplify()` | Unsupported | No | Mesh post-processing, not exact BREP |
| `warp()` | Unsupported | No | Deformation is mesh-domain today |
| `hull3d()` | Unsupported | No | No exact convex-hull replay yet |
| `trimByPlane()` / `split*()` | Unsupported | No | Exact OCCT replay not implemented |
| `TrackedShape` topology preservation | Partial | Synthetic only | Export succeeds for supported base solids, but named topology is not written to STEP/BREP |
| Colors/materials in STEP/BREP | Unsupported | No | Geometry only for now |
| STEP assembly structure/BOM metadata | Unsupported | No | Compound only, no product structure export yet |

## Planned Expansion Order

1. Exact provenance-preserving replay for library helpers such as `lib.elbow()`, `lib.bolt()`, and related fastener/tube builders
2. Safe exact affine scale replay where OCCT can preserve exact solids, especially scaled-sphere / pad workflows
3. Exact OCCT-native operations where BREP matters most: `shell`, precise fillet/chamfer, richer face-driven feature ops
4. Optional STEP product structure and metadata export

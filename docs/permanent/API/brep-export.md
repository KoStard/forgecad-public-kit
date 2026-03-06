# BREP Export Parity

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
| `rect(...).translate()` | Supported | Yes | Recorded as profile transforms |
| `circle2d(...).translate()` | Supported | Yes | Recorded as profile transforms |
| `rect(...).rotate()` | Supported | Yes | Recorded as profile transforms |
| `circle2d(...).rotate()` | Supported | Yes | Recorded as profile transforms |
| `rect(...).extrude(height)` | Supported | Yes | `twist/divisions/scaleTop` must be absent |
| `circle2d(...).extrude(height)` | Supported | Yes | `twist/divisions/scaleTop` must be absent |
| `rect/circle.revolve(degrees)` | Supported | Yes | Replayed around Forge's revolve axis convention |
| `shape.translate()` | Supported | Yes | Recorded as exact solid transform |
| `shape.rotate(x, y, z)` | Supported | Yes | Euler replay only |
| `union()` | Supported | Yes | Only when every operand is exact-exportable |
| `difference()` | Supported | Yes | Only when every operand is exact-exportable |
| `intersection()` | Supported | Yes | Only when every operand is exact-exportable |
| Returned multi-object scene | Supported | Yes | Exported as a STEP/BREP compound |
| `roundedRect()` | Unsupported | No | Needs exact rounded-profile replay |
| `polygon()` / `ngon()` / `ellipse()` / `slot()` / `star()` | Unsupported | No | No exact 2D wire/profile replay yet |
| Sketch booleans (`union2d`, `difference2d`, `intersection2d`) | Unsupported | No | Requires exact 2D region replay |
| Sketch `offset()` | Unsupported | No | Requires exact 2D offset reconstruction |
| Sketch `mirror()` / `scale()` / arbitrary `warp()` | Unsupported | No | Not recorded in export plan |
| `Shape.transform(matrix)` | Unsupported | No | Arbitrary affine replay not implemented |
| `rotateAround(...)` / `pointAlong(...)` / `mirror(...)` | Unsupported | No | Needs exact transform-plan support |
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

1. Exact 2D profile replay for `roundedRect`, `polygon`, `ellipse`, and sketch booleans
2. Exact transform replay for `rotateAround`, `mirror`, and matrix-safe subsets
3. Exact OCCT-native operations where BREP matters most: `shell`, precise fillet/chamfer, sketch-on-face
4. Optional STEP product structure and metadata export

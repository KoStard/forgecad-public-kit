---
skill-group: sdf
skill-order: 100
---

# SDF Modeling

Signed Distance Field modeling for organic forms, smooth booleans, TPMS lattices, and deformations. SDFs are inherently implicit fields, not B-rep/exact geometry; use them with caution when precision or exact export matters. Return raw `SdfShape` values directly for native preview; use `toShape(...)` when materializing SDF trees for CAD/export workflows.

## Contents

- [SDF Materialization](#sdf-materialization)
- [SdfShape](#sdfshape)
- [sdf](#sdf)
- [Sculpt](#sculpt)

## Functions

### SDF Materialization

#### `toShape(value: unknown, options?: SdfToShapeOptions): ToShapeTreeResult` — Materialize one SDF leaf or all SDF leaves in a renderable tree.

Raw `SdfShape` values become mesh-backed [`Shape`](/docs/core#shape)s. Plain objects and arrays preserve their renderable children as a [`ShapeGroup`](/docs/core#shapegroup) when more than one leaf is found. Non-renderable metadata is ignored for materialization and remains available to callers through normal [`require()`](/docs/core#require) return values.

**`SdfToShapeOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `edgeLength?` | `number` | Target mesh edge length. Smaller = finer mesh. Overrides quality-derived resolution. |
| `bounds?` | `{ min: Vec3; max: Vec3; }` | Override auto-computed bounds. Strongly recommended for infinite/repeated fields. |
| `quality?` | `SdfMeshingQuality` | Coarse quality preset. Default: 'preview'. |
| `tolerance?` | `number` | Preferred absolute surface tolerance in millimeters. |
| `minFeatureSize?` | `number` | Smallest feature that should survive meshing, in millimeters. |
| `simplify?` | `boolean \| "safe"` | Simplification control. `false` disables, `true` and `'safe'` use topology-validated simplification. |
| `maxTriangles?` | `number` | Optional post-extraction triangle budget. Fractional values are floored for compatibility. |
| `maxGridPoints?` | `number` | Optional pre-extraction grid-point budget. Default is browser-safe. |
| `minEdgeLength?` | `number` | Lower clamp for resolved edge length. Default: 0.15mm. |
| `diagnostics?` | `boolean` | Log resolved meshing settings and backend extraction timings. |

---

## Classes

### `SdfShape`

An immutable SDF expression. Supports SDF-specific operations (smooth booleans, domain warps, etc.), can be returned directly for native preview, and converts to a ForgeCAD Shape via `.toShape()` when materialization is needed.

#### `get colorHex(): string | undefined` — Display color carried by this implicit leaf.

#### `get materialProps(): ShapeMaterialProps | undefined` — Display material carried by this implicit leaf.

#### `get explicitBounds(): SdfBounds | undefined` — Explicit bounds carried by this implicit leaf, if any.

#### `clone(): SdfShape` — Clone this SDF expression and its visual metadata.

#### `toShape(options?: SdfToShapeOptions): Shape` — Mesh this SDF into a ForgeCAD Shape. Typed SDF trees materialize through Rust Manifold Dual Contouring; dynamic trees (custom/noise/voronoi/displace/blend callbacks) mesh through the Surface Nets pipeline. Once converted, the result is a regular Shape — booleans, transforms, export all work.

#### `color(value: string | undefined): SdfShape` — Set the display color for this implicit leaf.

#### `material(props: ShapeMaterialProps): SdfShape` — Set PBR display material properties for this implicit leaf.

`ShapeMaterialProps` — defined in [core](/docs/core).

#### `bounds(bounds: SdfBounds | [ Vec3, Vec3 ]): SdfShape` — Set explicit preview/meshing bounds for this implicit leaf.

`SdfBounds`: `{ min: Vec3, max: Vec3 }`

#### `at(x: number, y: number, z: number): SdfShape` — Sculpt-style alias for translate().

#### `spin(angleDeg: number): SdfShape` — Sculpt-style alias for rotateZ().

#### `tilt(angleDeg: number, axis?: "x" | "y" | "z" | Vec3): SdfShape` — Sculpt-style tilt around X, Y, Z, or a custom axis.

#### `round(radius: number): SdfShape` — Round all edges of a primitive box while preserving its outer dimensions. Sugar over `offset()`: the box is shrunk by `radius` on every side, then dilated back out with `offset(radius)`, which rounds every edge and corner.

For any other shape, use `.offset(radius)` directly (note it grows the part by `radius`), or `Sculpt.box(x, y, z, { radius })` for a rounded box.

#### `blend(other: SdfShape, options?: number | { radius?: number; }): SdfShape` — Sculpt-style smooth blend with another implicit shape.

#### `carve(other: SdfShape, options?: number | { radius?: number; }): SdfShape` — Sculpt-style smooth carve/subtract.

#### `polish(input?: SculptPolishInput): SdfShape` — Apply a Sculpt material preset or direct material props.

#### `union(...others: SdfShape[]): SdfShape` — SDF union (sharp).

```js
sdf.box(20, 20, 8).union(sdf.cylinder(16, 6), sdf.sphere(7))
```

#### `subtract(...others: SdfShape[]): SdfShape` — SDF difference (sharp) — subtracts others from this.

#### `intersect(...others: SdfShape[]): SdfShape` — SDF intersection (sharp). Also the canonical way to fill a body with a lattice or clip an infinite field to a design space:

```js
// Lattice fill — keep only the gyroid inside the body
sdf.sphere(18).intersect(sdf.gyroid({ cellSize: 6, wallThickness: 0.8 }))

// Clip an infinite field to a box-shaped design space
sdf.gyroid({ cellSize: 6, wallThickness: 0.8 }).intersect(sdf.box(40, 25, 16))
```

#### `smoothUnion(other: SdfShape, radius: number): SdfShape` — Smooth union — blends shapes together with a smooth radius.

#### `smoothSubtract(other: SdfShape, radius: number): SdfShape` — Smooth difference — smoothly carves other from this.

#### `smoothIntersect(other: SdfShape, radius: number): SdfShape` — Smooth intersection — smoothly intersects.

#### `morph(other: SdfShape, t: number): SdfShape` — Morph between this shape and another. t=0 → this, t=1 → other.

#### `translate(x: number, y: number, z: number): SdfShape` — Translate this SDF by the given offsets in millimeters.

#### `rotate(axis: Vec3, angleDeg: number): SdfShape` — Rotate around an arbitrary axis through the origin.

#### `rotateX(angleDeg: number): SdfShape` — Rotate around the X axis by the given angle in degrees.

#### `rotateY(angleDeg: number): SdfShape` — Rotate around the Y axis by the given angle in degrees.

#### `rotateZ(angleDeg: number): SdfShape` — Rotate around the Z axis by the given angle in degrees.

#### `scale(factor: number): SdfShape` — Uniformly scale this SDF around the origin.

#### `twist(degreesPerUnit: number): SdfShape` — Twist around the Z axis.

#### `bend(radius: number): SdfShape` — Bend around the Z axis with given radius.

#### `repeat(spacing: Vec3, count?: Vec3): SdfShape` — Repeat in space. Spacing of 0 on an axis means no repetition. Count of 0 = infinite.

#### `circularArray(count: number, offset?: number): SdfShape` — Arrange this SDF in a circular array around the Z axis.

The source shape is translated by `offset` in +X before arraying. This uses angular domain folding, so evaluation stays O(1): the source SDF is sampled twice no matter how many copies are requested.

#### `shell(thickness: number): SdfShape` — Hollow out, keeping only a shell of given thickness.

#### `offset(distance: number): SdfShape` — Offset the distance field by a constant amount in millimeters.

Positive `distance` dilates: every surface moves outward by `distance`, which rounds convex edges and corners — and grows the part by `distance`. Negative `distance` erodes: surfaces move inward, shrinking the part and thinning walls. This is the canonical SDF field offset (`d − distance`) and works on ANY implicit shape — sharp booleans, TPMS lattices, `sdf.fromFunction()` fields — not just primitives.

Like `shell()`, the result is approximate on fields that are not exact distance fields (for example after `twist()`, `bend()`, or smooth booleans).

```js
// Round every edge of a sharp union by 2mm (grows the part by 2mm)
sdf.box(20, 20, 8).union(sdf.cylinder(16, 6)).offset(2)

// Erode a lattice by 0.2mm to compensate printed over-extrusion
sdf.sphere(18).intersect(sdf.gyroid({ cellSize: 6, wallThickness: 1.2 })).offset(-0.2)
```

#### `displace(fn: ((x: number, y: number, z: number) => number) | SdfShape, constants?: Record<string, number>): SdfShape` — Displace the surface by a function of position, or by a pattern SdfShape.

```js
// Function displacement
shape.displace((x, y, z) => Math.sin(x) * 0.5)

// Pattern displacement from a 3D SDF field
shape.displace(sdf.knurl({ pitch: 2, depth: 0.3 }))
```

#### `surfaceDisplace(pattern: SurfacePattern | ((u: number, v: number) => number), options?: SurfaceDisplaceOptions): SdfShape` — Displace the surface using a 2D pattern in surface-local UV coordinates.

Automatically detects the shape's UV parametrization (sphere, cylinder, torus) from the SDF tree. Falls back to triplanar mapping for arbitrary shapes.

UV coordinates are in **surface millimeters** — patterns defined with `spacing: 3` always produce 3mm spacing, regardless of shape size.

Prefer `sdf.pattern2d()` or built-in surface patterns when the relief should stay on the native shader and meshing path. Callback functions are supported for experimentation, but they are opaque to the typed pattern optimizer.

```js
// Native typed pattern — auto-detects sphere UV
const p = sdf.pattern2d()
const ribs = p.stripes({ spacing: 3, width: 0.8, depth: 0.35 })
  .add(p.sineWave({ direction: [0, 1], wavelength: 14, amplitude: 0.08 }))

sdf.sphere(27).shell(3)
  .surfaceDisplace(ribs)
  .toShape()

// Custom 2D pattern via function
shape.surfaceDisplace((u, v) => -Math.sin(u * 2) * 0.3)
```

**`SurfaceDisplaceOptions`**
- `uv?: "auto" | "sphere" | "cylinder" | "torus" | "triplanar"` — Override auto-detected UV mode. Default: 'auto' (detects from SDF tree).
- `triplanarSharpness?: number` — Triplanar blend sharpness — higher = crisper transitions. Default: 4. Only used in triplanar mode.

#### `onion(layers: number, thickness: number): SdfShape` — Create concentric onion layers.

---

## Constants

### `sdf`

SDF modeling — signed distance field primitives, smooth booleans, TPMS lattices, domain warps, and surface patterns.

Return `SdfShape` values directly from a script for native raymarch preview; plain objects and arrays of SDF leaves render too (object keys become named preview parts). Shapes live as a lazy expression tree — call `.toShape()` / `toShape(...)` only at the materialization boundary: export, mesh booleans, or mixed SDF/manifold projects.

SDF geometry is implicit and sampled, not B-rep/exact. Use with caution when precision, tolerances, or exact export matter.

```js
return {
  shell: sdf.smoothUnion(sdf.sphere(10), sdf.box(15, 15, 15), { radius: 3 }).shell(2),
  core: sdf.gyroid({ cellSize: 6, wallThickness: 0.8 })
    .intersect(sdf.sphere(18))
    .color('#ffcf5a'),
};
```

- `sphere(radius: number): SdfShape` — Create an SDF sphere centered at the origin.
- `box(x: number, y: number, z: number): SdfShape` — Create an SDF box centered at the origin with given full dimensions (not half-extents).
- `cylinder(height: number, radius: number): SdfShape` — Create an SDF cylinder centered at the origin, axis along Z.
- `torus(majorRadius: number, minorRadius: number): SdfShape` — Create an SDF torus centered at the origin, lying in the XY plane.
- `capsule(height: number, radius: number): SdfShape` — Create an SDF capsule centered at the origin, axis along Z.
- `cone(height: number, radius: number): SdfShape` — Create an SDF cone with base at z=0 and tip at z=height.
- `smoothUnion(a: SdfShape, b: SdfShape, options: { radius: number; }): SdfShape` — Smooth union — blends shapes together with a smooth transition radius.
- `smoothDifference(a: SdfShape, b: SdfShape, options: { radius: number; }): SdfShape` — Smooth difference — smoothly subtracts b from a.
- `smoothIntersection(a: SdfShape, b: SdfShape, options: { radius: number; }): SdfShape` — Smooth intersection — smoothly intersects a and b.
- `blend(a: SdfShape, b: SdfShape, fn: (x: number, y: number, z: number) => number, options?: BlendOptions): SdfShape` — Spatially blend between two SDF patterns. The blend function receives (x, y, z) and returns 0..1: 0 = fully pattern `a`, 1 = fully pattern `b`.
- `gyroid(options: TpmsOptions): SdfShape` — Gyroid TPMS lattice — the most common lattice for additive manufacturing.
- `schwarzP(options: TpmsOptions): SdfShape` — Schwarz-P TPMS lattice — isotropic pore structure.
- `diamond(options: TpmsOptions): SdfShape` — Diamond TPMS lattice — stiffest TPMS structure.
- `lidinoid(options: TpmsOptions): SdfShape` — Lidinoid TPMS lattice — visually distinct from gyroid, popular in research and art.
- `noise(options?: NoiseOptions): SdfShape` — 3D Simplex noise field — produces organic, natural-looking displacements.
- `voronoi(options?: VoronoiOptions): SdfShape` — 3D Voronoi pattern — organic cellular structures like bone, coral, or soap bubbles.
- `honeycomb(options?: HoneycombOptions): SdfShape` — Honeycomb (hexagonal) lattice pattern. Intersect with your shape to apply.
- `waves(options?: WavesOptions): SdfShape` — Sinusoidal wave ridges — parallel ridges along an axis.
- `knurl(options?: KnurlOptions): SdfShape` — Knurl pattern — crossed helical grooves for grips and handles.
- `perforated(options?: PerforatedOptions): SdfShape` — Perforated plate pattern — regular array of cylindrical holes.
- `scales(options?: ScalesOptions): SdfShape` — Fish/dragon scale pattern — overlapping circular scales in hex-packed rows.
- `brick(options?: BrickOptions): SdfShape` — Brick/stone wall pattern — running bond with mortar grooves.
- `weave(options?: WeaveOptions): SdfShape` — Grid lattice pattern — two families of infinite slabs crossing at 90°.
- `basketWeave(options?: BasketWeaveOptions): SurfacePattern` — Basket weave surface pattern — threads with over-under crossings in UV space. Returns a SurfacePattern for use with `.surfaceDisplace()`.
- `pattern2d(): Pattern2DBuilder` — Create typed, composable 2D surface patterns for `.surfaceDisplace()`.
- `SurfacePattern: typeof SurfacePattern` — A 2D surface pattern — a heightmap function for use with `.surfaceDisplace()`.
- `fromFunction(fn: SdfFunctionSource, options: SdfFunctionOptions): SdfShape` — Create a custom SDF from one expression; shader-safe expressions keep shader metadata for tooling.
- `combine(value: unknown, options?: CombineOptions): SdfShape` — Collapse a plain object/array tree of SDF leaves into one continuous implicit field. Per-leaf color/material identity is intentionally discarded — the result is one scalar field. Use plain object returns for multi-material SDF preview, and `sdf.combine(...)` only when you want one implicit body. Explicit shape lists are covered by `a.union(b, c)`; pass `{ op: 'intersection' }` to intersect instead.

  ```js
  // Built a part as a named tree for preview, now need one field to shell:
  const parts = { body: sdf.box(40, 30, 12), boss: sdf.cylinder(10, 8) };
  return sdf.combine(parts).shell(1.2);
  ```
- `Sculpt: { ... }` — Sculpt-like facade: friendly liquid-modeling verbs backed by the same SDF kernel. See [`Sculpt`](#sculpt).

### `Sculpt`

- `sphere(radius: number): SdfShape` — Create a liquid SDF sphere centered at the origin.
- `box(x: number, y: number, z: number, options?: SculptBoxOptions): SdfShape` — Create a liquid SDF box; pass `{ radius }` for a rounded box.
- `cylinder(height: number, radius: number): SdfShape` — Create a liquid SDF cylinder centered at the origin, axis along Z.
- `disk(radius: number, thickness?: number): SdfShape` — Create a thin circular disk centered at the origin, axis along Z. Useful as a circular cutter or insert.
- `capsule(height: number, radius: number): SdfShape` — Create a liquid SDF capsule centered at the origin, axis along Z.
- `torus(majorRadius: number, minorRadius: number): SdfShape` — Create a liquid SDF torus lying in the XY plane.
- `cone(height: number, radius: number): SdfShape` — Create a liquid SDF cone.
- `tube(points: SculptPointList, options?: SculptTubeOptions): SdfShape` — Create a smooth tube through a list of 3D points.
- `curve(points: SculptPointList, options?: SculptTubeOptions): SdfShape` — Create a smooth variable-thickness sweep through 3D control points.
- `blend(first?: SculptBlendArg, optionsOrShape?: SculptBlendArg, ...rest: SculptBlendArg[]): SdfShape` — Smoothly blend one or more SDF shapes into a continuous body.
- `union(first?: SculptBlendInput, ...rest: SculptBlendInput[]): SdfShape` — Sharply union one or more SDF shapes.
- `carve(base: SdfShape, cutters: SculptBlendInput, options?: SculptBlendOptions): SdfShape` — Smoothly subtract one or more cutter shapes from a base shape.
- `keep(first?: SculptBlendArg, optionsOrShape?: SculptBlendArg, ...rest: SculptBlendArg[]): SdfShape` — Smoothly intersect one or more SDF shapes.
- `polish(shape: SdfShape, input?: SculptPolishInput): SdfShape` — Apply a Sculpt material preset or direct material properties.
- `material(input?: SculptPolishInput): ShapeMaterialProps & { color?: string; }` — Resolve a Sculpt material preset to ForgeCAD material properties.
- `look(preset?: SculptLookPreset): SceneOptions` — Return a polished scene preset tuned for liquid SDF preview.
- `knownMaterials(): SculptMaterialPreset[]` — List the built-in Sculpt material preset names.

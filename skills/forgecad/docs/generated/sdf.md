---
skill-group: sdf
skill-order: 100
---

# SDF Modeling

Signed Distance Field modeling for organic forms, smooth booleans, TPMS lattices, and deformations. SDFs are inherently implicit fields, not B-rep/exact geometry; use them with caution when precision or exact export matters. Return raw `SdfShape` values directly for native preview; use `toShape(...)` when materializing SDF trees for CAD/export workflows.

## Contents

- [SDF Materialization](#sdf-materialization) — `toShape`, `combine`
- [SdfShape](#sdfshape)
- [sdf](#sdf)
- [Sculpt](#sculpt)

## Functions

### SDF Materialization

#### `toShape()` — Materialize one SDF leaf or all SDF leaves in a renderable tree.

Raw `SdfShape` values become mesh-backed [`Shape`](/docs/core#shape)s. Plain objects and arrays preserve their renderable children as a [`ShapeGroup`](/docs/core#shapegroup) when more than one leaf is found. Non-renderable metadata is ignored for materialization and remains available to callers through normal [`require()`](/docs/core#require) return values.

```ts
toShape(value: unknown, options?: SdfToShapeOptions): ToShapeTreeResult
```

**`SdfToShapeOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `edgeLength?` | `number` | Target mesh edge length. Smaller = finer mesh. Overrides quality-derived resolution. |
| `bounds?` | `{ min: Vec3; max: Vec3; }` | Override auto-computed bounds. Strongly recommended for infinite/repeated fields. |
| `quality?` | `SdfMeshingQuality` | Coarse quality preset. Default: 'preview'. |
| `tolerance?` | `number` | Preferred absolute surface tolerance in millimeters. |
| `minFeatureSize?` | `number` | Smallest feature that should survive meshing, in millimeters. |
| `simplify?` | `boolean \| "safe"` | Simplification control. `false` disables, `true` and `'safe'` use topology-validated simplification. |
| `maxTriangles?` | `number` | Optional post-extraction triangle budget. |
| `maxGridPoints?` | `number` | Optional pre-extraction grid-point budget. Default is browser-safe. |
| `minEdgeLength?` | `number` | Lower clamp for resolved edge length. Default: 0.15mm. |
| `diagnostics?` | `boolean` | Log resolved meshing settings and backend extraction timings. |

#### `combine()` — Collapse a tree of SDF leaves into one continuous SDF field.

This intentionally discards per-leaf color/material identity because the result is one scalar field. Use plain object returns for multi-material SDF preview, and use `combine(...)` only when you want one implicit body.

```ts
combine(value: unknown, options?: CombineOptions): SdfShape
```

`CombineOptions`: `{ op?: "union" | "intersection" }`

---

## Classes

### `SdfShape`

An immutable SDF expression. Supports SDF-specific operations (smooth booleans, domain warps, etc.), can be returned directly for native preview, and converts to a ForgeCAD Shape via `.toShape()` when materialization is needed.

#### `colorHex()` — Display color carried by this implicit leaf.

```ts
get colorHex(): string | undefined
```

#### `materialProps()` — Display material carried by this implicit leaf.

```ts
get materialProps(): ShapeMaterialProps | undefined
```

#### `explicitBounds()` — Explicit bounds carried by this implicit leaf, if any.

```ts
get explicitBounds(): SdfBounds | undefined
```

#### `clone()` — Clone this SDF expression and its visual metadata.

```ts
clone(): SdfShape
```

#### `toShape()` — Mesh this SDF into a ForgeCAD Shape through ForgeCAD's Surface Nets pipeline. Once converted, the result is a regular Shape — booleans, transforms, export all work.

```ts
toShape(options?: SdfToShapeOptions): Shape
```

#### `color()` — Set the display color for this implicit leaf.

```ts
color(value: string | undefined): SdfShape
```

#### `material()` — Set PBR display material properties for this implicit leaf.

```ts
material(props: ShapeMaterialProps): SdfShape
```

#### `bounds()` — Set explicit preview/meshing bounds for this implicit leaf.

```ts
bounds(bounds: SdfBounds | [ Vec3, Vec3 ]): SdfShape
```

#### `at()` — Sculpt-style alias for translate().

```ts
at(x: number, y: number, z: number): SdfShape
```

#### `move()` — Sculpt-style alias for translate().

```ts
move(x: number, y: number, z: number): SdfShape
```

#### `spin()` — Sculpt-style alias for rotateZ().

```ts
spin(angleDeg: number): SdfShape
```

#### `tilt()` — Sculpt-style tilt around X, Y, Z, or a custom axis.

```ts
tilt(angleDeg: number, axis?: "x" | "y" | "z" | Vec3): SdfShape
```

#### `round()` — Sculpt-style rounded-box helper. Currently applies directly to primitive SDF boxes.

```ts
round(radius: number): SdfShape
```

#### `blend()` — Sculpt-style smooth blend with another implicit shape.

```ts
blend(other: SdfShape, options?: number | { radius?: number; }): SdfShape
```

#### `goop()` — Sculpt-style alias for blend().

```ts
goop(other: SdfShape, options?: number | { radius?: number; }): SdfShape
```

#### `carve()` — Sculpt-style smooth carve/subtract.

```ts
carve(other: SdfShape, options?: number | { radius?: number; }): SdfShape
```

#### `keep()` — Sculpt-style smooth intersection/keep operation.

```ts
keep(other: SdfShape, options?: number | { radius?: number; }): SdfShape
```

#### `polish()` — Apply a Sculpt material preset or direct material props.

```ts
polish(input?: SculptPolishInput): SdfShape
```

#### [`union()`](/docs/core#union) — SDF union (sharp).

```ts
union(...others: SdfShape[]): SdfShape
```

#### `subtract()` — SDF difference (sharp) — subtracts others from this.

```ts
subtract(...others: SdfShape[]): SdfShape
```

#### `intersect()` — SDF intersection (sharp).

```ts
intersect(...others: SdfShape[]): SdfShape
```

#### `clipBox()` — Clip this SDF to an explicit box-shaped design space.

```ts
clipBox(x: number, y: number, z: number): SdfShape
```

#### `fillWith()` — Keep only the material where this shape overlaps another SDF pattern.

```ts
fillWith(pattern: SdfShape): SdfShape
```

#### `fillWithGyroid()` — Keep only the gyroid lattice inside this shape.

```ts
fillWithGyroid(options: TpmsOptions): SdfShape
```

#### `fillWithSchwarzP()` — Keep only the Schwarz-P lattice inside this shape.

```ts
fillWithSchwarzP(options: TpmsOptions): SdfShape
```

#### `fillWithDiamond()` — Keep only the diamond TPMS lattice inside this shape.

```ts
fillWithDiamond(options: TpmsOptions): SdfShape
```

#### `fillWithLidinoid()` — Keep only the lidinoid TPMS lattice inside this shape.

```ts
fillWithLidinoid(options: TpmsOptions): SdfShape
```

#### `smoothUnion()` — Smooth union — blends shapes together with a smooth radius.

```ts
smoothUnion(other: SdfShape, radius: number): SdfShape
```

#### `smoothSubtract()` — Smooth difference — smoothly carves other from this.

```ts
smoothSubtract(other: SdfShape, radius: number): SdfShape
```

#### `smoothIntersect()` — Smooth intersection — smoothly intersects.

```ts
smoothIntersect(other: SdfShape, radius: number): SdfShape
```

#### `morph()` — Morph between this shape and another. t=0 → this, t=1 → other.

```ts
morph(other: SdfShape, t: number): SdfShape
```

#### `translate()` — Translate this SDF by the given offsets in millimeters.

```ts
translate(x: number, y: number, z: number): SdfShape
```

#### `rotate()` — Rotate around an arbitrary axis through the origin.

```ts
rotate(axis: [ number, number, number ], angleDeg: number): SdfShape
```

#### `rotateX()` — Rotate around the X axis by the given angle in degrees.

```ts
rotateX(angleDeg: number): SdfShape
```

#### `rotateY()` — Rotate around the Y axis by the given angle in degrees.

```ts
rotateY(angleDeg: number): SdfShape
```

#### `rotateZ()` — Rotate around the Z axis by the given angle in degrees.

```ts
rotateZ(angleDeg: number): SdfShape
```

#### `scale()` — Uniformly scale this SDF around the origin.

```ts
scale(factor: number): SdfShape
```

#### `twist()` — Twist around the Z axis.

```ts
twist(degreesPerUnit: number): SdfShape
```

#### `bend()` — Bend around the Z axis with given radius.

```ts
bend(radius: number): SdfShape
```

#### `repeat()` — Repeat in space. Spacing of 0 on an axis means no repetition. Count of 0 = infinite.

```ts
repeat(spacing: Vec3, count?: Vec3): SdfShape
```

#### `circularArray()` — Arrange this SDF in a circular array around the Z axis.

The source shape is translated by `offset` in +X before arraying. This uses angular domain folding, so evaluation stays O(1): the source SDF is sampled twice no matter how many copies are requested.

```ts
circularArray(count: number, offset?: number): SdfShape
```

#### `shell()` — Hollow out, keeping only a shell of given thickness.

```ts
shell(thickness: number): SdfShape
```

#### `displace()` — Displace the surface by a function of position, or by a pattern SdfShape.

```js
// Function displacement
shape.displace((x, y, z) => Math.sin(x) * 0.5)

// Pattern displacement from a 3D SDF field
shape.displace(sdf.knurl({ pitch: 2, depth: 0.3 }))
```

```ts
displace(fn: ((x: number, y: number, z: number) => number) | SdfShape, constants?: Record<string, number>): SdfShape
```

#### `surfaceDisplace()` — Displace the surface using a 2D pattern in surface-local UV coordinates.

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

```ts
surfaceDisplace(pattern: SurfacePattern | ((u: number, v: number) => number), options?: SurfaceDisplaceOptions): SdfShape
```

#### `onion()` — Create concentric onion layers.

```ts
onion(layers: number, thickness: number): SdfShape
```

---

## Constants

### `sdf`

SDF modeling — signed distance field primitives, smooth booleans, TPMS lattices, domain warps, and surface patterns.

Return `SdfShape` values directly from a ForgeCAD script for native raymarch preview. Plain objects and arrays of SDF leaves are renderable too, so object keys become named preview parts.

Call `.toShape()` or `toShape(...)` only when you need a mesh-backed ForgeCAD Shape for export, mesh booleans, or mixed SDF/manifold projects. All shapes live as a lazy expression tree until that materialization boundary.

SDF is inherently implicit and sampled, not B-rep/exact geometry. Use it with caution when precision, tolerances, or exact export matter.

```js
return sdf.smoothUnion(sdf.sphere(10), sdf.box(15, 15, 15), { radius: 3 })
  .color('#4488cc');
```

```js
return {
  shell: sdf.sphere(20).shell(2).color('#9be7ff'),
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
- `morph(a: SdfShape, b: SdfShape, t: number): SdfShape` — Morph between two SDF shapes. t=0 → a, t=1 → b.
- `blend(a: SdfShape, b: SdfShape, fn: (x: number, y: number, z: number) => number, options?: BlendOptions): SdfShape` — Spatially blend between two SDF patterns. The blend function receives (x, y, z) and returns 0..1: 0 = fully pattern `a`, 1 = fully pattern `b`.
- `gyroid(options: TpmsOptions): SdfShape` — Gyroid TPMS lattice — the most common lattice for additive manufacturing.
- `schwarzP(options: TpmsOptions): SdfShape` — Schwarz-P TPMS lattice — isotropic pore structure.
- `diamond(options: TpmsOptions): SdfShape` — Diamond TPMS lattice — stiffest TPMS structure.
- `lidinoid(options: TpmsOptions): SdfShape` — Lidinoid TPMS lattice — visually distinct from gyroid, popular in research and art.
- `tpmsBlock(options: TpmsBlockOptions): SdfShape` — TPMS block preset clipped to an explicit design space.
- `withinBox(shape: SdfShape, options: { size: Vec3; }): SdfShape` — Clip an SDF shape to a box-shaped design space.
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
- `twist(shape: SdfShape, degreesPerUnit: number): SdfShape` — Twist an SDF shape around the Z axis.
- `bend(shape: SdfShape, radius: number): SdfShape` — Bend an SDF shape around the Z axis.
- `repeat(shape: SdfShape, spacing: Vec3, count?: Vec3): SdfShape` — Repeat an SDF shape in space.
- `circularArray(shape: SdfShape, count: number, offset?: number): SdfShape` — Arrange an SDF shape in a circular array around the Z axis with O(1) folded-domain evaluation.
- `SurfacePattern: typeof SurfacePattern` — A 2D surface pattern — a heightmap function for use with `.surfaceDisplace()`.
- `fromFunction(fn: SdfFunctionSource, options: SdfFunctionOptions): SdfShape` — Create a custom SDF from one expression; shader-safe expressions raymarch directly.
- `Sculpt: { sphere: (radius: number) => SdfShape; box: (x: number, y: number, z: number, options?: SculptBoxOptions) => SdfShape; cylinder: (height: number, radius: number) => SdfShape; disk: (radius: number, thickness?: number) => SdfShape; circle: (radius: number, thickness?: number) => SdfShape; capsule: (height: number, radius: number) => SdfShape; torus: (majorRadius: number, minorRadius: number) => SdfShape; cone: (height: number, radius: number) => SdfShape; tube: (points: SculptPointList, options?: SculptTubeOptions) => SdfShape; curve: (points: SculptPointList, options?: SculptTubeOptions) => SdfShape; path: (points: SculptPointList, options?: SculptTubeOptions) => SdfShape; blend: (first?: SculptBlendInput | SculptBlendOptions, optionsOrShape?: SculptBlendInput | SculptBlendOptions, ...rest: (SculptBlendInput | SculptBlendOptions)[]) => SdfShape; union: (first?: SculptBlendInput, ...rest: SculptBlendInput[]) => SdfShape; carve: (base: SdfShape, cutters: SculptBlendInput, options?: SculptBlendOptions) => SdfShape; keep: (first?: SculptBlendInput | SculptBlendOptions, optionsOrShape?: SculptBlendInput | SculptBlendOptions, ...rest: (SculptBlendInput | SculptBlendOptions)[]) => SdfShape; polish: (shape: SdfShape, input?: SculptPolishInput) => SdfShape; material: (input?: SculptPolishInput) => ShapeMaterialProps & { color?: string; }; look: (preset?: SculptLookPreset) => SceneOptions; knownMaterials: typeof knownSculptMaterialPresets; }` — Sculpt-like facade: friendly liquid-modeling verbs backed by the same SDF kernel.

### `Sculpt`

- `sphere(radius: number): SdfShape` — Create a liquid SDF sphere centered at the origin.
- `box(x: number, y: number, z: number, options?: SculptBoxOptions): SdfShape` — Create a liquid SDF box; pass `{ radius }` for a rounded box.
- `cylinder(height: number, radius: number): SdfShape` — Create a liquid SDF cylinder centered at the origin, axis along Z.
- `disk(radius: number, thickness?: number): SdfShape` — Create a thin circular disk centered at the origin, axis along Z. Useful as a circular cutter or insert.
- `circle(radius: number, thickness?: number): SdfShape` — Alias for `Sculpt.disk()`.
- `capsule(height: number, radius: number): SdfShape` — Create a liquid SDF capsule centered at the origin, axis along Z.
- `torus(majorRadius: number, minorRadius: number): SdfShape` — Create a liquid SDF torus lying in the XY plane.
- `cone(height: number, radius: number): SdfShape` — Create a liquid SDF cone.
- `tube(points: SculptPointList, options?: SculptTubeOptions): SdfShape` — Create a smooth tube through a list of 3D points.
- `curve(points: SculptPointList, options?: SculptTubeOptions): SdfShape` — Create a smooth variable-thickness sweep through 3D control points.
- `path(points: SculptPointList, options?: SculptTubeOptions): SdfShape` — Alias for `Sculpt.tube()`; points may use [x, y, z, radius] for variable thickness.
- `blend(first?: SculptBlendArg, optionsOrShape?: SculptBlendArg, ...rest: SculptBlendArg[]): SdfShape` — Smoothly blend one or more SDF shapes into a continuous body.
- `union(first?: SculptBlendInput, ...rest: SculptBlendInput[]): SdfShape` — Sharply union one or more SDF shapes.
- `carve(base: SdfShape, cutters: SculptBlendInput, options?: SculptBlendOptions): SdfShape` — Smoothly subtract one or more cutter shapes from a base shape.
- `keep(first?: SculptBlendArg, optionsOrShape?: SculptBlendArg, ...rest: SculptBlendArg[]): SdfShape` — Smoothly intersect one or more SDF shapes.
- `polish(shape: SdfShape, input?: SculptPolishInput): SdfShape` — Apply a Sculpt material preset or direct material properties.
- `material(input?: SculptPolishInput): ShapeMaterialProps & { color?: string; }` — Resolve a Sculpt material preset to ForgeCAD material properties.
- `look(preset?: SculptLookPreset): SceneOptions` — Return a polished scene preset tuned for liquid SDF preview.
- `knownMaterials(): SculptMaterialPreset[]` — List the built-in Sculpt material preset names.

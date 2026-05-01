---
skill-group: core
skill-order: 100
---

# Core API

3D primitives, boolean operations, transforms, patterns, imports, and parameters.

## Contents

- [3D Primitives](#3d-primitives) — `box`, `cylinder`, `sphere`, `torus`
- [Boolean Operations](#boolean-operations) — `union`, `difference`, `intersection`
- [Edge Features](#edge-features) — `fillet`, `chamfer`, `draft`, `offsetSolid`
- [Patterns & Layout](#patterns-layout) — `circularLayout`, `polygonVertices`, `linearPattern`, `circularPattern`, `linearPattern2d`, `circularPattern2d`, `mirrorCopy`, `selectEdges`, `selectEdge`, `coalesceEdges`
- [Imports & Composition](#imports-composition) — `require`, `importSvgSketch`, `importMesh`, `importStep`
- [Parameters](#parameters) — `Param.number`, `Param.string`, `Param.bool`, `Param.choice`, `Param.list`
- [Grouping & Local Coordinates](#grouping-local-coordinates) — `group`
- [Section & Projection](#section-projection) — `intersectWithPlane`, `faceProfile`, `projectToPlane`
- [Transforms](#transforms) — `composeChain`
- [Backend Runtime](#backend-runtime) — `initKernel`, `setActiveBackend`, `activateBackend`, `getActiveBackend`
- [Verification](#verification) — `spec`
- [Shape](#shape) — Appearance, Face Topology, Edge Topology, Transforms, Booleans & Cutting, Features, Placement, Connectors, References, Measurement
- [Transform](#transform)
- [ShapeGroup](#shapegroup) — Children, Transforms, Placement, Connectors, References
- [SurfacePattern](#surfacepattern)
- [ShapeRef](#shaperef)
- [ANCHOR3D_NAMES](#anchor3d-names)
- [verify](#verify)
- [Constraint](#constraint)
- [Points](#points)
- [connector](#connector)

## Functions

### 3D Primitives

#### `box()` — Create a rectangular box. Centered on XY, base at Z=0.

Extents:

- X: `[-width/2, width/2]`
- Y: `[-depth/2, depth/2]`
- Z: `[0, height]`

For named faces, build from a labeled sketch: `rect(width, depth).labelEdges('s', 'e', 'n', 'w').extrude(height, { labels: { start: 'bottom', end: 'top' } })`.

```ts
box(width: number, depth: number, height: number): Shape
```

#### `cylinder()` — Create a cylinder or cone with named faces and edges. Centered on XY, base at Z=0.

Extents:

- X/Y: centered at the origin
- Z: `[0, height]`

`radiusTop` defaults to `radius`. Set `radiusTop` smaller to taper the side, or `0` for a pointy cone. Use `segments` to create regular prisms (for example `6` for a hexagonal prism).

Named faces: `top`, `bottom`, `side` Named edges: `top-rim`, `bottom-rim`

```ts
cylinder(height: number, radius: number, radiusTop?: number, segments?: number): Shape
```

#### `sphere()` — Create a sphere centered at the origin.

Extents:

- X: `[-radius, radius]`
- Y: `[-radius, radius]`
- Z: `[-radius, radius]`

Use `segments` for lower-poly approximations.

```ts
sphere(radius: number, segments?: number): Shape
```

#### `torus()` — Create a torus (donut shape) lying in the XY plane. Centered on all axes.

Extents:

- X: `[-(majorRadius + minorRadius), +(majorRadius + minorRadius)]`
- Y: `[-(majorRadius + minorRadius), +(majorRadius + minorRadius)]`
- Z: `[-minorRadius, minorRadius]`

The origin is the center of the ring.

```ts
torus(majorRadius: number, minorRadius: number, segments?: number): Shape
```

### Boolean Operations

#### `union()` — Combine shapes into a single solid (additive boolean).

Accepts individual shapes, or an array of shapes. `union()` returns one solid, so only the first operand's color is preserved in the result. Use `group()` when you want separate child colors or identities.

```ts
union(...inputs: ShapeOperandInput[]): Shape
```

#### `difference()` — Subtract shapes from a base shape (subtractive boolean).

The first shape is the base; all subsequent shapes are subtracted from it. Accepts individual shapes, or an array of shapes.

```ts
difference(...inputs: ShapeOperandInput[]): Shape
```

#### `intersection()` — Keep only the overlapping volume of the input shapes (intersection boolean).

Requires at least two shapes. Accepts individual shapes, or an array.

```ts
intersection(...inputs: ShapeOperandInput[]): Shape
```

### Edge Features

#### `fillet()` — Apply fillets (rounded edges) to one or more edges of a shape.

Works on both straight and curved edges. Supports OCCT and Manifold backends. When using OCCT, all edges are filleted in a single kernel operation for best quality. When using Manifold, edges are filleted sequentially.

The `edges` parameter is flexible:

- Omit to fillet **all** sharp edges
- Pass an `EdgeQuery` for an inline filter (most common)
- Pass an `EdgeSegment` or `EdgeSegment[]` from `selectEdges()` for pre-selected edges

Throws if no edges match the selection, or if `radius` is not a positive finite number.

```ts
// Fillet all edges
fillet(myShape, 2)

// Fillet only top convex edges
fillet(myShape, 1.5, { atZ: 20, convex: true })

// Fillet vertical edges selected beforehand
const edges = selectEdges(myShape, { parallel: [0, 0, 1] })
fillet(myShape, 3, edges)
```

```ts
fillet(shape: Shape, radius: number, edges?: EdgeSelector, segments?: number): Shape
```

#### `chamfer()` — Apply chamfers (beveled edges) to one or more edges of a shape.

Produces a 45° bevel at the specified `size` (distance from edge). Works on both straight and curved edges. Supports OCCT and Manifold backends.

The `edges` parameter accepts the same options as `fillet()`: inline `EdgeQuery`, pre-selected `EdgeSegment`/`EdgeSegment[]`, or `undefined` (all sharp edges).

```ts
// Chamfer all edges
chamfer(myShape, 1)

// Chamfer only vertical edges
chamfer(myShape, 2, { parallel: [0, 0, 1] })
```

```ts
chamfer(shape: Shape, size: number, edges?: EdgeSelector): Shape
```

#### `draft()` — Apply a draft angle (taper) to vertical faces for mold extraction.

Adds a taper angle to the vertical faces of a solid so that it can be extracted from a mold. The neutral plane is the Z position where the draft angle is zero — faces above and below are tapered symmetrically. Typical values for injection molding are 1–5°.

Requires the OCCT backend. Throws on Manifold.

```ts
// Add 3° draft to a box for injection molding
draft(myBox, 3)

// Draft with custom pull direction and neutral plane
draft(myShape, 2, [0, 0, 1], 10)
```

```ts
draft(shape: Shape, angleDeg: number, pullDirection?: [ number, number, number ], neutralPlaneOffset?: number): Shape
```

#### `offsetSolid()` — Uniformly offset all surfaces of a solid inward or outward.

Unlike `shell()`, which hollows a solid by removing one face, `offsetSolid()` produces a new solid whose every surface is shifted by `thickness`. Positive values grow the shape outward; negative values shrink it inward.

Requires the OCCT backend. Throws on Manifold.

```ts
// Grow a box outward by 1mm on all sides
offsetSolid(myBox, 1)

// Shrink a shape inward by 0.5mm
offsetSolid(myShape, -0.5)
```

```ts
offsetSolid(shape: Shape, thickness: number): Shape
```

### Patterns & Layout

#### `circularLayout()` — Compute evenly-spaced positions around a circle.

Eliminates the most common trig pattern in CAD scripts:

```js
// Before — manual trig
for (let i = 0; i < 12; i++) {
  const angle = i * 30 * Math.PI / 180;
  markers.push(marker.translate(r * Math.cos(angle), r * Math.sin(angle), 0));
}

// After — declarative
for (const {x, y} of circularLayout(12, r)) {
  markers.push(marker.translate(x, y, 0));
}
```

```ts
circularLayout(count: number, radius: number, options?: CircularLayoutOptions): LayoutPoint[]
```

**`CircularLayoutOptions`**
- `startDeg?: number` — Angle of the first element in degrees (default: 0 = +X axis).
- `centerX?: number` — Center X coordinate (default: 0).
- `centerY?: number` — Center Y coordinate (default: 0).

`LayoutPoint`: `{ x: number, y: number }`

#### `polygonVertices()` — Compute the vertex positions of a regular polygon.

Default orientation places the first vertex at the top (90 degrees), matching the convention used by [`ngon()`](/docs/sketch#ngon).

Eliminates manual Math.sqrt(3) for triangles, pentagon vertex math, etc:

```js
// Before — manual equilateral triangle
const v1 = [center.x - r/2, center.y + r * Math.sqrt(3)/2];
const v2 = [center.x - r/2, center.y - r * Math.sqrt(3)/2];
const v3 = [center.x + r, center.y];

// After — declarative
const [v1, v2, v3] = polygonVertices(3, r);
```

```ts
polygonVertices(sides: number, radius: number, options?: PolygonVerticesOptions): LayoutPoint[]
```

**`PolygonVerticesOptions`**
- `startDeg?: number` — Angle of the first vertex in degrees (default: 90 = top).
- `centerX?: number` — Center X coordinate (default: 0).
- `centerY?: number` — Center Y coordinate (default: 0).

#### `linearPattern()` — Repeat a shape in a linear pattern along a direction vector and union the copies.

Creates `count` copies of `shape`, each offset by `(dx*i, dy*i, dz*i)` from the original. All copies are unioned into a single `Shape`. Distinct compiler ownership is assigned to each copy so face identity via owner-scoped canonical queries still works post-merge.

```ts
// 5 cylinders, 20mm apart along X
linearPattern(cylinder(10, 3), 5, 20, 0)
```

```ts
linearPattern(shape: Shape, count: number, dx: number, dy: number, dz?: number): Shape
```

#### `circularPattern()` — Repeat a shape in a circular pattern around an axis and union the copies.

Distributes `count` copies evenly around the rotation axis (360° / count per step). All copies are unioned into a single `Shape`. Distinct compiler ownership is assigned to each copy — post-merge face identity via owner-scoped canonical queries still works for pattern descendants.

Two calling conventions:

- **Simple** (Z axis): `circularPattern(shape, 6)` or `circularPattern(shape, 6, centerX, centerY)`
- **Advanced** (arbitrary axis): `circularPattern(shape, 6, { axis, origin })`

```ts
// 8 holes evenly spaced around origin
circularPattern(cylinder(12, 4).translate(30, 0, -1), 8)

// Circular pattern around X axis
circularPattern(myFeature, 4, { axis: [1, 0, 0], origin: [0, 0, 50] })
```

```ts
circularPattern(shape: Shape, count: number, centerXOrOpts?: number | CircularPatternOptions, centerY?: number): Shape
```

**`CircularPatternOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `centerX?` | `number` | Center X of the rotation (default: 0). Used when axis is Z (legacy mode). |
| `centerY?` | `number` | Center Y of the rotation (default: 0). Used when axis is Z (legacy mode). |
| `axis?` | `[ number, number, number ]` | Rotation axis direction (default: [0, 0, 1] = Z axis). |
| `origin?` | `[ number, number, number ]` | Pivot point for the rotation (default: [0, 0, 0]). Overrides centerX/centerY when set. |

#### `linearPattern2d()` — Repeat a 2D sketch in a linear pattern and union the copies.

```ts
linearPattern2d(sketch: Sketch, count: number, dx: number, dy?: number): Sketch
```

#### `circularPattern2d()` — Repeat a 2D sketch in a circular pattern around a center point and union the copies.

```ts
circularPattern2d(sketch: Sketch, count: number, centerXOrOpts?: number | { centerX?: number; centerY?: number; startDeg?: number; }, centerY?: number): Sketch
```

#### `mirrorCopy()` — Mirror a shape across a plane and union the mirror with the original.

The mirror plane passes through the origin and is defined by its normal vector. The mirrored copy is unioned with the original to produce a single symmetric Shape.

```ts
// Mirror across the YZ plane (X=0)
mirrorCopy(box(50, 30, 10), [1, 0, 0])
```

```ts
mirrorCopy(shape: Shape, normal: [ number, number, number ]): Shape
```

#### `selectEdges()` — Select all edges from a shape that match the given query.

Extracts sharp edges from the mesh (dihedral angle > 1°), applies all filters in the query, and returns the matching `EdgeSegment[]`. When `near` is specified the results are sorted closest-first.

Works on any shape — primitives, booleans, shells, and imported meshes. Use this when tracked topology is unavailable (e.g. after a difference or on imported geometry). For simpler cases, pass an `EdgeQuery` directly to `fillet()` or `chamfer()` instead of calling `selectEdges` separately.

```ts
// Fillet all top edges of a box
const topEdges = selectEdges(part, { atZ: 20, perpendicular: [0, 0, 1] });
let result = part;
for (const edge of coalesceEdges(topEdges)) {
  result = fillet(result, 2, edge);
}
```

```ts
selectEdges(shape: Shape, query?: EdgeQuery): EdgeSegment[]
```

**`EdgeQuery`**

| Option | Type | Description |
|--------|------|-------------|
| `near?` | `Vec3` | Sort by proximity to this point (closest first). When used with `selectEdge`, picks the closest match. |
| `parallel?` | `Vec3` | Filter: edge direction approximately parallel to this vector. |
| `perpendicular?` | `Vec3` | Filter: edge direction approximately perpendicular to this vector. |
| `convex?` | `boolean` | Filter: only convex (outside corner) edges. |
| `concave?` | `boolean` | Filter: only concave (inside corner) edges. |
| `minAngle?` | `number` | Filter: minimum dihedral angle in degrees. |
| `maxAngle?` | `number` | Filter: maximum dihedral angle in degrees. |
| `minLength?` | `number` | Filter: minimum edge length. |
| `maxLength?` | `number` | Filter: maximum edge length. |
| `within?` | `BoundingRegion` | Filter: edge midpoint must be within this bounding region. |
| `atZ?` | `number` | Shorthand: edge midpoint Z ≈ this value (within `tolerance`). Equivalent to `within: { zMin: atZ - tol, zMax: atZ + tol }`. |
| `tolerance?` | `number` | Position tolerance for approximate matches (default: `1.0`). Used by `atZ` and `near`. |
| `angleTolerance?` | `number` | Angular tolerance in degrees for `parallel`/`perpendicular` filters (default: `10`). |

`BoundingRegion`: `{ xMin?: number, xMax?: number, yMin?: number, yMax?: number, zMin?: number, zMax?: number }`

**`EdgeSegment`**

| Option | Type | Description |
|--------|------|-------------|
| `index` | `number` | Stable index within the extraction (deterministic for a given mesh). |
| `direction` | `Vec3` | Normalized direction from start → end. |
| `dihedralAngle` | `number` | Dihedral angle in degrees (0 = coplanar, 180 = knife edge). |
| `convex` | `boolean` | true = outside corner (convex), false = inside corner (concave). |
| `normalA` | `Vec3` | Normal of first adjacent face. |
| `normalB` | `Vec3` | Normal of second adjacent face (same as normalA for boundary edges). |
| `boundary` | `boolean` | true if this is a boundary (unmatched) edge — unusual for closed solids. |
| `start`, `end`, `midpoint`, `length` | | — |

#### `selectEdge()` — Select the single best-matching edge from a shape.

When `near` is specified, returns the edge whose midpoint is closest to that point. Otherwise returns the first matching edge in mesh order. Throws if no edges match the query — useful as a guard when you expect exactly one result.

```ts
// Chamfer one specific edge near a known point
const bottomEdge = selectEdge(part, { near: [25, 0, 0], atZ: 0 });
result = chamfer(result, 1.5, bottomEdge);
```

```ts
selectEdge(shape: Shape, query?: EdgeQuery): EdgeSegment
```

#### `coalesceEdges()` — Merge collinear edge segments into longer logical edges.

Tessellation often splits one geometric edge into multiple short segments. `coalesceEdges` groups adjacent collinear segments and merges each group into a single `EdgeSegment` spanning the full extent. This is usually needed before passing edges to `fillet()` or `chamfer()` on non-primitive shapes.

The `tolerance` controls the maximum perpendicular distance from collinearity before two segments are considered non-collinear. Default: `0.01`.

```ts
const topEdges = selectEdges(part, { atZ: 20 });
for (const edge of coalesceEdges(topEdges)) {
  result = fillet(result, 2, edge);
}
```

```ts
coalesceEdges(segments: EdgeSegment[], tolerance?: number): EdgeSegment[]
```

### Imports & Composition

#### `require()` — Import a module with optional ForgeCAD parameter overrides. Returns the module's exports.

When importing a `.forge.js` file, the return value is what the script returns. If the script returns a metadata object (e.g. `{ shape: myShape, bolts: {...} }`), the caller receives the full object — renderable values and metadata together.

**Parameter scoping:** Parameters declared in required files are automatically namespaced with a `"filename#N / "` prefix (e.g. `"bracket.forge.js#1 / Width"`). This prevents collisions when multiple files declare same-named params. Each file's params appear as separate sliders.

**Parameter overrides:** When passing overrides, use the bare param name (not the scoped name). Overrides are type-checked — unrecognized keys throw an error with typo suggestions.

**Multi-file assembly pattern** — pass cross-cutting design values from the assembly to parts:

```js
// assembly.forge.js — owns cross-cutting params, passes to parts
const wall = param("Wall", 3);
const baseH = param("Base Height", 20);

const mount = require('./motor-mount.forge.js', { Wall: wall });
const base  = require('./base-body.forge.js', { Wall: wall, Height: baseH });
```

**Metadata pattern** — parts publish interface data alongside geometry:

```js
// motor-mount.forge.js
return { shape: mount, bolts: { dia: 5.3, pos: holePositions } };

// base-body.forge.js
const mount = require('./motor-mount.forge.js');
mount.bolts.pos  // access the metadata
mount.shape       // access the geometry
```

```ts
require(path: string, paramOverrides?: Record<string, number | string>): any
```

#### `importSvgSketch()` — Parse an SVG file and return it as a Sketch with options for region filtering, scaling, and simplification.

```ts
importSvgSketch(fileName: string, options?: SvgImportOptions): Sketch
```

**`SvgImportOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `include?` | `"auto" \| "fill" \| "stroke" \| "fill-and-stroke"` | Which geometry channels to include: - `auto`: prefer fills; if no fill geometry exists, fall back to strokes - `fill`: import only filled regions - `stroke`: import only stroke geometry - `fill-and-stroke`: include both |
| `regionSelection?` | `"all" \| "largest"` | Keep all disconnected regions, or only the largest. |
| `maxRegions?` | `number` | Keep at most this many regions (largest-first). |
| `minRegionArea?` | `number` | Drop regions below this absolute area threshold. |
| `minRegionAreaRatio?` | `number` | Drop regions below this ratio of largest-region area. |
| `flattenTolerance?` | `number` | Curve flattening tolerance in SVG user units. Smaller = more segments, higher fidelity. |
| `arcSegments?` | `number` | Minimum segment count for arc discretization. |
| `scale?` | `number` | Global scale applied after SVG parsing. |
| `maxWidth?` | `number` | Maximum imported sketch width. If exceeded, geometry is uniformly downscaled to fit. |
| `maxHeight?` | `number` | Maximum imported sketch height. If exceeded, geometry is uniformly downscaled to fit. |
| `centerOnOrigin?` | `boolean` | Recenter imported geometry so its 2D bounds center is at CAD origin. |
| `simplify?` | `number` | Simplification tolerance for final sketch cleanup. |
| `invertY?` | `boolean` | Flip SVG Y-down coordinates to CAD Y-up. Enabled by default. |

#### `importMesh()` — Import an external mesh file (STL, OBJ, 3MF) as a Shape.

```ts
importMesh(fileName: string, options?: { scale?: number; center?: boolean; }): Shape
```

#### `importStep()` — Import a STEP file (.step, .stp) as an exact OCCT-backed Shape. Preserves NURBS curves, B-spline surfaces, and exact topology. Requires `setActiveBackend('occt')`.

```ts
importStep(fileName: string): Shape
```

### Parameters

#### `Param.number()` — Declare a numeric parameter that renders as a slider in the UI.

Each call registers a slider control. When the user moves the slider the entire script re-executes with the new value. Parameter values are also overridable from `require()` imports or the CLI `--param` flag — the `name` string is the key used in both cases.

Default range rules when options are omitted:

- `min` defaults to `0`
- `max` defaults to `defaultValue * 4`
- `step` is auto-calculated: `1` for integer params, `0.1` for ranges ≤ 100, `1` for larger ranges

The `unit` option is cosmetic only — no conversion is performed. Use `integer: true` for counts, sides, quantities (rounds to whole numbers; step defaults to `1`).

```ts
const width = Param.number("Width", 50);
const angle = Param.number("Angle", 45, { min: 0, max: 180, unit: "°" });
const sides = Param.number("Sides", 6, { min: 3, max: 12, integer: true });
```

**Parameter overrides** — key must match `name` exactly:

```ts
// Via require()
const bracket = require("./bracket.forge.js", { Width: 80 });

// Via CLI
// forgecad run model.forge.js --param "Wall Thickness=3"
```

Also available as the shorthand alias `param()`.

```ts
Param.number(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean; }): number
```

#### `Param.string()` — Declare a string parameter that renders as a text input in the UI.

String parameters let users type free-form text — labels, names, inscriptions, file paths, etc. The `name` string is the override key.

```ts
const label = Param.string("Label", "Hello World");
const name  = Param.string("Name", "Part-001", { maxLength: 20 });
```

Override via import:

```ts
const tag = require("./tag.forge.js", { Label: "Custom Text" });
```

Only available as `Param.string()` — no standalone alias.

```ts
Param.string(name: string, defaultValue: string, opts?: { maxLength?: number; }): string
```

#### `Param.bool()` — Declare a boolean parameter that renders as a checkbox in the UI.

Internally stored as `0`/`1`. When overriding from CLI or `require()`, pass `1` for true and `0` for false. The `name` string is the override key.

```ts
const showHoles = Param.bool("Show Holes", true);
if (showHoles) return difference(plate, cylinder(10, 5).translate(50, 30, 0));
return plate;
```

Override via import:

```ts
const pan = require("./pan.forge.js", { "Show Lid": 0 });
```

Also available as the shorthand alias `boolParam()`.

```ts
Param.bool(name: string, defaultValue: boolean): boolean
```

#### `Param.choice()` — Declare a choice parameter that renders as a dropdown in the UI.

`defaultValue` must exactly match one entry in `choices`. Returns the selected string label. Prefer `Param.choice` over `Param.number` when a slider would hide intent — named choices like `"wok"` are self-describing.

Overrides may be passed as the choice label string (preferred) or as a numeric index. The `name` string is the override key.

```ts
const panStyle = Param.choice("Pan Style", "frying-pan", ["frying-pan", "saute-pan", "wok"]);
if (panStyle === "wok") return buildWok();
```

Override via import:

```ts
const pan = require("./pan.forge.js", { "Pan Style": "wok" });
```

Override via CLI:

```bash
forgecad run model.forge.js --param "Pan Style=wok"
```

Also available as the shorthand alias `choiceParam()`.

```ts
Param.choice(name: string, defaultValue: string, choices: string[]): string
```

#### `Param.list()` — Declare a list parameter — an array of struct items with per-field UI controls.

Each item in the list is a struct whose fields each render as their own control (slider, checkbox, or dropdown). The user can add/remove rows up to `minItems`/`maxItems` bounds.

Field types:

- Boolean fields (`boolean: true` in field defs) return as `boolean`
- Choice fields (`choices: [...]` in field defs) return as `string`
- All other fields return as `number`

```ts
Param.list<T extends Record<string, number | boolean | string>>(name: string, defaultItems: T[], opts: { ... }): T[]
```

`ListParamFieldDef`: `{ min?: number, max?: number, step?: number, unit?: string, integer?: boolean, boolean?: boolean, choices?: string[] }`

### Grouping & Local Coordinates

#### `group()` — Group multiple shapes/sketches for joint transforms without merging into a single mesh.

Unlike union(), child colors and individual identities are preserved. Children can be plain shapes, named descriptors ({ name, shape/sketch/group }), or nested groups. The returned ShapeGroup supports all Shape transforms (translate, rotate, etc.).

**Local coordinate pattern:** Build child parts at the origin (local coordinates), then group and translate once to place the whole assembly. This eliminates the error-prone pattern of manually adding parent offsets to every sub-part.

```js
// BAD — every sub-part repeats the parent's global offset
const unitX = 0, unitY = -18, unitZ = 70;
const body = roundedBox(100, 20, 32, 4).translate(unitX, unitY, unitZ);
const panel = box(98, 2, 18).translate(unitX, unitY - 12, unitZ + 4);
const louver = box(88, 2, 6).translate(unitX, unitY - 14, unitZ - 11);
```

// GOOD — build at origin, group, translate once const body = roundedBox(100, 20, 32, 4); const panel = box(98, 2, 18).translate(0, -12, 4); const louver = box(88, 2, 6).translate(0, -14, -11); const indoorUnit = group( { name: 'Body', shape: body }, { name: 'Panel', shape: panel }, { name: 'Louver', shape: louver }, ).translate(0, -18, 70);

```ts
group(...items: GroupInput[]): ShapeGroup
```

### Section & Projection

#### `intersectWithPlane()` — Cross-section: slice a 3D shape with a plane and return the intersection as a 2D Sketch.

```ts
intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch
```

#### `faceProfile()` — Extract the boundary profile of a named face as a 2D sketch.

The result is returned in the face's local 2D coordinate system, making it convenient for offsets, pocket profiles, or follow-up sketch operations driven by an existing face.

```ts
faceProfile(shape: Shape, face: FaceSelector): Sketch
```

#### `projectToPlane()` — Orthographically project a 3D shape onto a plane and return the silhouette as a 2D Sketch.

```ts
projectToPlane(shape: Shape, plane: PlaneSpec): Sketch
```

### Transforms

#### `composeChain()` — Compose transforms in chain order. Equivalent to Transform.identity().mul(a).mul(b).mul(c)...

```ts
composeChain(...steps: TransformInput[]): Transform
```

### Backend Runtime

#### `initKernel()`

```ts
initKernel(): Promise<unknown>
```

#### `setActiveBackend()`

```ts
setActiveBackend(backend: ActiveBackend): void
```

#### `activateBackend()` — Set the active backend and ensure its WASM module is initialized. Call this instead of `setActiveBackend` when you're about to execute code — it guarantees the backend is ready, not just selected.

```ts
activateBackend(backend: ActiveBackend): Promise<void>
```

#### `getActiveBackend()`

```ts
getActiveBackend(): ActiveBackend
```

### Verification

#### `spec()` — Create a named, reusable bundle of verification checks.

A spec groups related `verify.*` calls under a collapsible header in the Checks panel. This makes large check suites scannable. Specs can be applied to multiple shapes and can check relationships between parts.

Specs can be defined in separate `.forge.js` files and imported via `require()` to share them across models.

`spec.check()` returns a `SpecResult` — you can inspect it programmatically or ignore the return value and let the Checks panel show results.

```ts
const printable = spec("Fits printer bed", (shape) => {
  verify.notEmpty("Has geometry", shape);
  const bb = shape.boundingBox();
  verify.lessThan("Width  < 220mm", bb.max[0] - bb.min[0], 220);
  verify.lessThan("Depth  < 220mm", bb.max[1] - bb.min[1], 220);
  verify.lessThan("Height < 250mm", bb.max[2] - bb.min[2], 250);
});

// Reuse on multiple shapes
printable.check(bracket);
printable.check(standoff);

// Check relationships between parts
const fitSpec = spec("Assembly fit", (partA, partB) => {
  verify.notColliding("No interference", partA, partB, 10);
});
fitSpec.check(bracket, standoff);
```

**Spec-first workflow:** Write specs before building geometry. Checks go from red to green as you build — effectively TDD for CAD.

```ts
spec(name: string, checkFn: (...args: any[]) => void): Spec
```

**`Spec`**
- `name: string` — The display name of this spec

---

## Classes

### `Shape`

Core 3D solid shape. All operations are immutable and return new shapes.

Supports transforms (translate, rotate, scale, mirror, transform, rotateAround, pointAlong), booleans (add, subtract, intersect), cutting (split, splitByPlane, trimByPlane), shelling, anchor positioning (attachTo, onFace), placement references, and queries (volume, surfaceArea, boundingBox, isEmpty, numTri, geometryInfo).

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `materialProps` | `ShapeMaterialProps | undefined` | — |

**Appearance**

#### `color()` — Set the color of this shape (hex string, e.g. "#ff0000"). Returns a new Shape with the color applied.

```ts
color(value: string | undefined): Shape
```

#### `material()` — Set PBR material properties for this shape's visual appearance.

Returns a new Shape with the specified material properties merged on top of any previously set properties. All properties are optional — omitted keys retain their current value. Material properties survive transforms and boolean operations.

Use `.color()` to set the base diffuse color; `.material()` controls how that color behaves under light (metalness, roughness, clearcoat) and can add emissive glow independent of lighting. Emissive glow pairs naturally with the `postProcessing.bloom` effect in [`scene()`](/docs/viewport#scene).

```js
box(50, 50, 50).material({ metalness: 0.9, roughness: 0.1 }); // polished metal
sphere(30).material({ emissive: '#ff6b35', emissiveIntensity: 2 }); // glowing
cylinder(40, 20).material({ opacity: 0.4, clearcoat: 1.0, clearcoatRoughness: 0.02 }); // ice

// Chainable with other shape methods
box(100, 100, 10).color('#gold').material({ metalness: 0.95, roughness: 0.05 }).translate(0, 0, 50);
```

```ts
material(props: ShapeMaterialProps): Shape
```

**Face Topology**

#### `face()` — Resolve a face by user-authored label or compiler-owned name. Returns a `FaceRef` that can be passed to `.onFace()`, `projectToPlane()`, or used directly in placement.

`.face(name)` is a pure label lookup — it finds faces by user-authored labels, not by geometric queries. Labels are born in sketches via `.label()` / `.labelEdges()` and grow into face names through extrude, loft, revolve, and sweep. They are stable references that travel with the geometry.

Labels must be unique within a shape. Use `.prefixLabels()` before combining shapes with `union()` / `difference()` to avoid collisions. Collision detection throws a clear error with a fix suggestion.

For compile-covered shapes (extrude, loft, etc.) the lookup resolves via the shape's compile plan. As a fallback, planar-faced mesh shapes (e.g. results of boolean ops) are resolved via coplanar triangle clustering.

```ts
// Edge labels become side face names after extrude
const profile = path()
  .moveTo(0, 0)
  .lineTo(100, 0).label('floor')
  .lineTo(100, 50).label('wall')
  .lineTo(0, 50).label('ceiling')
  .closeLabel('left-wall');
const room = profile.extrude(30, { labels: { start: 'base', end: 'top' } });
room.face('floor');   // side face from the labeled edge
room.face('base');    // base cap (user-specified)

// .labelEdges() shorthand for sequential edge labeling
const plate = rect(100, 50).labelEdges('south', 'east', 'north', 'west');
const solid = plate.extrude(20, { labels: { start: 'bottom', end: 'top' } });
solid.face('south'); // side face

// Prefix before combining to avoid collisions
const left = wing.prefixLabels('l/');
const right = wing.mirror([1, 0, 0]).prefixLabels('r/');
const full = union(left, right);
full.face('l/upper'); // left wing upper surface
```

```ts
face(selector: FaceSelector): FaceRef
```

#### `faces()` — Return faces matching a query, or label semantic faces when passed a mapping.

Mapping form returns a new shape: `shape.faces({ lid: 'top', walls: ['front', 'back', 'left', 'right'] })`.

```ts
faces(): FaceRef[]
```

#### `faceNames()` — List defined semantic face names currently available on this shape.

```ts
faceNames(): string[]
```

#### `prefixLabels()` — Prefix all user-authored face labels, including semantic labels from `faces(mapping)`. Returns a new shape with modified labels.

```ts
prefixLabels(prefix: string): Shape
```

#### `renameLabel()` — Rename a single face label. Returns a new shape.

```ts
renameLabel(from: string, to: string): Shape
```

#### `dropLabels()` — Remove specific face labels. Returns a new shape.

```ts
dropLabels(...names: string[]): Shape
```

#### `dropAllLabels()` — Remove all face labels. Returns a new shape.

```ts
dropAllLabels(): Shape
```

#### `faceHistory()` — Get the transformation history for a specific face.

```ts
faceHistory(name: string): FaceTransformationHistory
```

**Edge Topology**

#### `edge()` — Get a named topology edge. Only available on shapes with tracked topology (from box/cylinder/extrude).

```ts
edge(name: string): EdgeRef
```

#### `edgeNames()` — List named topology edge names. Returns empty array if shape has no tracked topology.

```ts
edgeNames(): string[]
```

#### `edgesOf()` — Return all boundary edges of a named face.

Finds edges where one adjacent mesh face belongs to the target face and the other belongs to a different face. The result is coalesced (tessellation fragments merged) and can be passed directly to `fillet()` or `chamfer()`.

This is a topological query — no coordinates, no tolerances, no minimum-length hacks. It works because an edge is the boundary between two faces.

```js
// Fillet all top edges of a mounting plate
let plate = box(120, 80, 6).faces({ workSurface: 'top' })
plate = fillet(plate, 3, plate.edgesOf('workSurface'))

// Shelled enclosure — fillet the outer lip
let body = box(80, 50, 35).faces({ opening: 'top' })
body = body.shell(2, { openFaces: ['top'] })
body = fillet(body, 1.5, body.edgesOf('opening'))

// Filter: only concave edges (after a boolean subtraction)
body.edgesOf('top', { concave: true })
```

```ts
edgesOf(faceLabel: string, options?: EdgesOfOptions): EdgeSegment[]
```

#### `edgesBetween()` — Return edges shared between two named faces.

An edge is "between" faces A and B when one of its adjacent mesh triangles belongs to A and the other belongs to B. This is the most precise topological edge selection — "fillet the edges where the top meets the wall."

The second argument can be a single face name or an array (edges between A and any of B1, B2, ...).

```js
// Fillet the edge where lid meets one wall
let body = box(100, 60, 30).faces({ lid: 'top', wall: 'side-left' })
body = fillet(body, 2, body.edgesBetween('lid', 'wall'))

// Fillet a cylinder rim — where the flat cap meets the curved barrel
let tube = cylinder(30, 10).faces({ cap: 'top', barrel: 'side' })
tube = fillet(tube, 1, tube.edgesBetween('cap', 'barrel'))

// Multiple target faces at once
body.edgesBetween('lid', ['left-wall', 'right-wall', 'front-wall', 'back-wall'])
```

```ts
edgesBetween(faceA: string, faceB: string | string[]): EdgeSegment[]
```

**Transforms**

#### `translate()` — Move the shape relative to its current position. All transforms are immutable and return new shapes.

```ts
translate(x: number, y: number, z: number): Shape
```

#### `translatePolar()` — Translate using polar coordinates (radius + angle in degrees). Eliminates manual `r * Math.cos(angle * PI/180)` calculations.

Example: `shape.translatePolar(50, 30)` moves 50mm at 30 degrees from +X.

```ts
translatePolar(radius: number, angleDeg: number, z?: number): Shape
```

#### `moveTo()` — Position the shape so its bounding box min corner is at the given global coordinate.

```ts
moveTo(x: number, y: number, z: number): Shape
```

#### `moveToLocal()` — Position the shape relative to another shape's local coordinate system (bounding box min corner).

```ts
moveToLocal(target: Shape | { toShape(): Shape; }, x: number, y: number, z: number): Shape
```

#### `rotate()` — Rotate around an arbitrary axis through the origin.

```ts
rotate(axis: [ number, number, number ], angleDeg: number, options?: { pivot?: [ number, number, number ]; }): Shape
```

#### `rotateX()` — Rotate around the X axis by the given angle in degrees.

```ts
rotateX(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): Shape
```

#### `rotateY()` — Rotate around the Y axis by the given angle in degrees.

```ts
rotateY(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): Shape
```

#### `rotateZ()` — Rotate around the Z axis by the given angle in degrees.

```ts
rotateZ(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): Shape
```

#### `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. `movingPoint` / `targetPoint` may be raw world points or this shape's anchors/references.

```ts
rotateAroundTo(axis: [ number, number, number ], pivot: [ number, number, number ], movingPoint: RotationPointLike, targetPoint: RotationPointLike, options?: RotateAroundToOptions): Shape
```

#### `transform()` — Apply a 4x4 affine transform matrix (column-major) or a Transform object.

```ts
transform(m: Mat4 | Transform): Shape
```

#### `scale()` — Scale the shape uniformly or per-axis from the shape's bounding box center. Accepts a single number or [x, y, z] array.

```ts
scale(v: number | [ number, number, number ]): Shape
```

#### `scaleAround()` — Scale the shape uniformly or per-axis from an explicit pivot point.

```ts
scaleAround(pivot: [ number, number, number ], v: number | [ number, number, number ]): Shape
```

#### `mirror()` — Mirror across a plane through the shape's bounding box center, defined by its normal vector.

```ts
mirror(normal: [ number, number, number ]): Shape
```

#### `mirrorThrough()` — Mirror across a plane through an explicit point, defined by its normal vector.

```ts
mirrorThrough(point: [ number, number, number ], normal: [ number, number, number ]): Shape
```

#### `pointAlong()` — Reorient a shape so its primary axis (Z) points along the given direction. Useful for laying cylinders/extrusions along X or Y without thinking about Euler angles. The shape's origin stays at [0,0,0] — translate after pointAlong to position it.

Example: cylinder(40, 5).pointAlong([1, 0, 0]) — lays cylinder along X, starting at origin

```ts
pointAlong(direction: [ number, number, number ]): Shape
```

**Booleans & Cutting**

#### `add()` — Union this shape with others (additive boolean). Method form of union().

```ts
add(...others: ShapeOperandInput[]): Shape
```

#### `subtract()` — Subtract other shapes from this one. Method form of difference().

```ts
subtract(...others: ShapeOperandInput[]): Shape
```

#### `intersect()` — Keep only the overlap with other shapes. Method form of intersection().

```ts
intersect(...others: ShapeOperandInput[]): Shape
```

#### `split()` — Split into [inside, outside] by another shape.

```ts
split(cutter: Shape | { toShape(): Shape; }): [ Shape, Shape ]
```

#### `splitByPlane()` — Split by infinite plane. Returns [positive-side, negative-side].

```ts
splitByPlane(normal: [ number, number, number ], originOffset?: number): [ Shape, Shape ]
```

#### `trimByPlane()` — Keep the positive side of the plane and discard the opposite side.

```ts
trimByPlane(normal: [ number, number, number ], originOffset?: number): Shape
```

**Features**

#### `shell()` — Hollow out compile-covered boxes, cylinders, and straight extrudes. `openFaces` names any subset of the base shape's labeled faces to leave open (no wall).

```ts
shell(thickness: number, opts?: { openFaces?: string[]; }): Shape
```

#### `pocket()` — Cut a pocket (cavity) into this solid through the named face.

```js
box(100, 100, 20).pocket('top', 8)
box(100, 100, 20).pocket('top', 8, { inset: 5 })
box(100, 100, 20).pocket('top', 8, { scale: 0.8 })
```

```ts
pocket(face: FaceSelector, depth: number, opts?: PocketOptions): Shape
```

#### `boss()` — Add a boss (protrusion) from the named face.

```js
box(100, 100, 20).boss('top', 5)
box(100, 100, 20).boss('top', 10, { scale: 0.6 })
```

```ts
boss(face: FaceSelector, height: number, opts?: BossOptions): Shape
```

#### `hole()` — Drill a hole into this solid at a face.

```js
box(50, 50, 20).hole('top', { diameter: 8, depth: 10 })
box(50, 50, 20).hole('top', { diameter: 6, counterbore: { diameter: 12, depth: 3 } })
```

```ts
hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape
```

#### `cutout()` — Cut a profile-shaped pocket through a face using a placed sketch.

The sketch must be placed on a face with `Sketch.onFace(...)`. The cut follows the sketch's 2D profile.

```js
const profile = circle2d(10).onFace(body, 'top');
body.cutout(profile, { depth: 5 })
```

```ts
cutout(sketch: Sketch, opts?: ShapeCutoutOptions): Shape
```

**Placement**

#### `placeReference()` — Translate the shape so the given anchor or reference lands on the target coordinate.

Accepts any built-in anchor name (`'bottom'`, `'center'`, `'top-front-left'`, etc.) or a custom placement reference attached via `withReferences()`.

```javascript
// Ground a shape — put its bottom face center at Z = 0
shape.placeReference('bottom', [0, 0, 0])

// Center at the world origin
shape.placeReference('center', [0, 0, 0])

// Align left edge to X = 10
shape.placeReference('left', [10, 0, 0])
```

```ts
placeReference(ref: PlacementAnchorLike, target: [ number, number, number ], offset?: [ number, number, number ]): Shape
```

#### `attachTo()` — Position this shape relative to another using named 3D anchor points.

Anchors are bounding-box-relative: 'center', face centers ('top', 'front', ...), edge midpoints ('top-front', 'back-left', ...), and corners ('top-front-left', ...). Anchor word order is flexible: 'front-left' and 'left-front' are equivalent. Named placement references (from withReferences) can also be used as anchors.

```ts
attachTo(target: ShapeAnchorTarget, targetAnchor: PlacementAnchorLike, selfAnchor?: PlacementAnchorLike, offset?: [ number, number, number ]): Shape
```

#### `onFace()` — Place this shape on a face of a parent shape.

Think of it like sticking a label on a box surface:

- `face` picks which surface ('front', 'back', 'top', etc.)
- `u, v` position within that face's 2D plane (from center)
- front/back: u = left/right (X), v = up/down (Z)
- left/right: u = forward/back (Y), v = up/down (Z)
- top/bottom: u = left/right (X), v = forward/back (Y)
- `protrude` = how far the child sticks out (positive = outward from face)

```ts
onFace(parent: ShapeAnchorTarget, face: "front" | "back" | "left" | "right" | "top" | "bottom", opts?: { u?: number; v?: number; protrude?: number; }): Shape
```

#### `seatInto()` — Slide this shape along an axis until a labeled face is embedded in the target body.

Position the shape roughly first (translate/rotate), then call seatInto to auto-adjust the penetration depth. No manual coordinate math needed.

```js
// Wing root embeds into fuselage — adapts to any fuselage shape
wing.translate(0, wingY, 0).seatInto(fuselage, 'root');

// Sensor pod sits flush on fuselage surface
pod.translate(0, station, radius + 20).seatInto(fuselage, 'base', { depth: 'flush' });

// Antenna with 3mm gasket standoff
mast.translate(0, station, radius + 50).seatInto(fuselage, 'mount', { depth: 'flush', gap: 3 });
```

```ts
seatInto(target: Shape, surface: string, options?: SeatIntoOptions): Shape
```

#### `seatOver()` — Slide this shape until a target's labeled face is fully covered (inside this shape).

The inverse of `seatInto`: instead of embedding *your* face into the target, you move until the *target's* face is embedded inside you.

```js
// Nacelle moves up until pylon's bottom face is inside the nacelle
nacelle.translate(rough).seatOver(pylon, 'bottom');

// Cap slides down over a post until post's top face is covered
cap.translate(rough).seatOver(post, 'top');
```

```ts
seatOver(target: Shape, targetSurface: string, options?: SeatIntoOptions): Shape
```

**Connectors**

#### `withConnectors()` — Attach named connectors — attachment points that survive transforms and imports. Connectors can be bare (position + orientation) or typed (with connectorType/gender for compatibility matching).

```ts
withConnectors(connectors: Record<string, ConnectorInput>): Shape
```

#### `connectorNames()` — List all connector names on this shape.

```ts
connectorNames(): string[]
```

#### `connectorsByType()` — Get all connectors of a given type.

```ts
connectorsByType(type: string): Array<{ name: string; port: ConnectorDef; }>
```

#### `connectorDistance()` — Distance between two connector origins on this shape.

```ts
connectorDistance(nameA: string, nameB: string): number
```

#### `connectorMeasurements()` — Get measurements metadata from a connector.

```ts
connectorMeasurements(name: string): Record<string, number | string>
```

#### `matchTo()` — Position this shape by matching connectors to a target.

Overloads:

- Single pair: `matchTo(target, selfConn, targetConn, options?)`
- Dictionary (same target): `matchTo(target, { selfConn: targetConn, ... }, options?)`
- Multi-target: `matchTo([ [target1, selfConn1, targetConn1], ... ], options?)`

```ts
matchTo(targetOrPairs: Shape | MatchTarget | Array<[ Shape | MatchTarget, string, string ]>, selfConnOrDict?: string | Record<string, string>, targetConnOrOptions?: string | MatchToOptions, maybeOptions?: MatchToOptions): Shape
```

**References**

#### `withReferences()` — Attach named placement references that survive normal transforms and imports.

```ts
withReferences(refs: PlacementReferenceInput): Shape
```

#### `referenceNames()` — List named placement references carried by this shape.

```ts
referenceNames(kind?: PlacementReferenceKind): string[]
```

#### `referencePoint()` — Resolve a named placement reference or built-in anchor to a 3D point.

```ts
referencePoint(ref: PlacementAnchorLike): [ number, number, number ]
```

**Measurement**

#### `boundingBox()` — Get the axis-aligned bounding box as { min: [x,y,z], max: [x,y,z] }.

```ts
boundingBox(): ShapeRuntimeBounds
```

#### `volume()` — Volume in mm cubed.

```ts
volume(): number
```

#### `surfaceArea()` — Surface area in mm squared.

```ts
surfaceArea(): number
```

#### `isEmpty()` — True if the shape contains no geometry.

```ts
isEmpty(): boolean
```

#### `numBodies()` — Number of disconnected solid bodies in this shape.

```ts
numBodies(): number
```

#### `numTri()` — Triangle count of the mesh representation.

```ts
numTri(): number
```

**Other**

#### `clone()` — Return a new Shape wrapper for explicit duplication in scripts.

```ts
clone(): Shape
```

#### `geometryInfo()` — Inspect which backend/representation produced this solid.

```ts
geometryInfo(): GeometryInfo
```

#### `as()` — Name this shape as a reference namespace for diagnostics and future published refs.

```ts
as(name: string): Shape
```

#### `ref()` — Resolve a semantic reference path like `lid`, `lid/back`, or a midpoint selector on `lid/back`.

```ts
ref(path: string): ShapeRef
```

#### `thicken()` — Offset-thicken an exact open surface or shell into a solid.

```ts
thicken(thickness: number): Shape
```

#### `getMesh()` — Extract triangle mesh for Three.js rendering

```ts
getMesh(): ShapeRuntimeMesh
```

#### `slice()` — Slice the runtime solid by a plane normal to local Z at the given offset.

```ts
slice(offset?: number): any
```

#### `project()` — Orthographically project the runtime solid onto the local XY plane.

```ts
project(): any
```

**Legacy Aliases**

- `withPorts()` -> `withConnectors()`
- `portNames()` -> `connectorNames()`

### `Transform`

#### `identity()` — Return the identity transform.

```ts
static identity(): Transform
```

#### `from()` — Wrap an existing `Transform` or raw 4x4 matrix as a `Transform`.

```ts
static from(input: TransformInput): Transform
```

#### `translation()` — Create a translation transform.

```ts
static translation(x: number, y: number, z: number): Transform
```

#### `scale()` — Create a uniform or per-axis scale transform.

```ts
static scale(v: number | Vec3): Transform
```

#### `rotationAxis()` — Create a rotation around an arbitrary axis, optionally about a pivot.

```ts
static rotationAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform
```

#### `rotateAroundTo()` — Solve the rotation needed to move one point onto a target line or plane.

```ts
static rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: Vec3, targetPoint: Vec3, options?: RotateAroundToOptions): Transform
```

#### `mul()` — Compose transforms in chain order: `a.mul(b)` applies `a`, then `b`.

```ts
mul(other: TransformInput): Transform
```

#### `translate()` — Translate after the current transform.

```ts
translate(x: number, y: number, z: number): Transform
```

#### `rotateAxis()` — Rotate after the current transform.

```ts
rotateAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform
```

#### `inverse()` — Return the inverse transform.

```ts
inverse(): Transform
```

#### [`point()`](/docs/sketch#point) — Transform a point using homogeneous coordinates.

```ts
point(p: Vec3): Vec3
```

#### `vector()` — Transform a direction vector without translation.

```ts
vector(v: Vec3): Vec3
```

#### `toArray()` — Return the transform as a raw 4x4 matrix array.

```ts
toArray(): Mat4
```

### `ShapeGroup`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `children` | `GroupChild[]` | — |
| `childNames` | `Array<string | undefined>` | — |

**Children**

#### `child()` — Return the named child by name. Throws if not found. Useful when importing a multipart group and working on components individually.

```ts
child(name: string): GroupChild
```

#### `childName()` — Return the optional name of the child at `index`.

```ts
childName(index: number): string | undefined
```

**Transforms**

#### `translate()` — Move the entire group by (x, y, z). All children move together as a unit.

```ts
translate(x: number, y: number, z: number): ShapeGroup
```

#### `moveTo()` — Move the group so its bounding-box min corner lands at the given coordinate.

```ts
moveTo(x: number, y: number, z: number): ShapeGroup
```

#### `moveToLocal()` — Move the group relative to another part's bounding-box min corner.

```ts
moveToLocal(target: Shape | ShapeGroup, x: number, y: number, z: number): ShapeGroup
```

#### `rotate()` — Rotate the group around an arbitrary axis through the origin.

```ts
rotate(axis: [ number, number, number ], angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateX()` — Rotate the group around the X axis.

```ts
rotateX(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateY()` — Rotate the group around the Y axis.

```ts
rotateY(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateZ()` — Rotate the group around the Z axis.

```ts
rotateZ(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateAroundAxis()` — Rotate around an arbitrary axis, optionally through a pivot point.

```ts
rotateAroundAxis(axis: [ number, number, number ], angleDeg: number, pivot?: [ number, number, number ]): ShapeGroup
```

#### `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. ShapeGroup string points use built-in anchors only.

```ts
rotateAroundTo(axis: [ number, number, number ], pivot: [ number, number, number ], movingPoint: Anchor3D | [ number, number, number ], targetPoint: Anchor3D | [ number, number, number ], options?: RotateAroundToOptions): ShapeGroup
```

#### `pointAlong()` — Reorient the group so its local Z axis points along `direction`.

```ts
pointAlong(direction: [ number, number, number ]): ShapeGroup
```

#### `transform()` — Apply a 4x4 transform matrix or `Transform` to all 3D children.

```ts
transform(m: Mat4 | Transform): ShapeGroup
```

#### `scale()` — Scale uniformly or per-axis from the group's bounding-box center.

```ts
scale(v: number | [ number, number, number ]): ShapeGroup
```

#### `scaleAround()` — Scale uniformly or per-axis from an explicit pivot point.

```ts
scaleAround(pivot: [ number, number, number ], v: number | [ number, number, number ]): ShapeGroup
```

#### `mirror()` — Mirror across a plane through the group's bounding-box center.

```ts
mirror(normal: [ number, number, number ]): ShapeGroup
```

#### `mirrorThrough()` — Mirror across a plane through an explicit point.

```ts
mirrorThrough(point: [ number, number, number ], normal: [ number, number, number ]): ShapeGroup
```

**Placement**

#### `placeReference()` — Translate the group so the given anchor or reference lands on the target coordinate.

Accepts any built-in anchor name (`'bottom'`, `'center'`, `'top-front-left'`, etc.) or a custom placement reference attached via `withReferences()`.

```javascript
// Ground a group — put its bottom at Z = 0
assembly.placeReference('bottom', [0, 0, 0])

// Use a custom reference from a multi-file part
const placed = require('./bracket-assembly.forge.js').group
  .placeReference('mountCenter', [0, 0, 50]);
```

```ts
placeReference(ref: PlacementAnchorLike, target: [ number, number, number ], offset?: [ number, number, number ]): ShapeGroup
```

#### `attachTo()` — Attach this group to a face or anchor on another part.

`targetAnchor` can be a built-in anchor name or a custom reference name on the target. `selfAnchor` selects the anchor on this group to align.

```ts
attachTo(target: Shape | ShapeGroup, targetAnchor: Anchor3D | string, selfAnchor?: Anchor3D, offset?: [ number, number, number ]): ShapeGroup
```

#### `onFace()` — Place this group on a face of a parent shape. See Shape.onFace() for full documentation.

```ts
onFace(parent: Shape | ShapeGroup, face: "front" | "back" | "left" | "right" | "top" | "bottom", opts?: { u?: number; v?: number; protrude?: number; }): ShapeGroup
```

**Connectors**

#### `withConnectors()` — Attach named connectors — attachment points that survive transforms. Connectors can be bare (position + orientation) or typed (with connectorType/gender for compatibility matching).

```ts
withConnectors(connectors: Record<string, ConnectorInput>): ShapeGroup
```

#### `connectorNames()` — List all connector names, including "ChildName.connectorName" from named children.

```ts
connectorNames(): string[]
```

#### `connectorsByType()` — Get all connectors of a given type, including from named children.

```ts
connectorsByType(type: string): Array<{ name: string; port: ConnectorDef; }>
```

#### `connectorDistance()` — Distance between two connector origins on this group (supports dotted child paths).

```ts
connectorDistance(nameA: string, nameB: string): number
```

#### `connectorMeasurements()` — Get measurements metadata from a connector (supports dotted child paths).

```ts
connectorMeasurements(name: string): Record<string, number | string>
```

#### `matchTo()` — Position this group by matching connectors to a target. Connector names support dotted paths into named children: "ChildName.connectorName".

Overloads:

- Single pair: `matchTo(target, selfConn, targetConn, options?)`
- Dictionary (same target): `matchTo(target, { selfConn: targetConn, ... }, options?)`
- Multi-target: `matchTo([ [target1, selfConn1, targetConn1], ... ], options?)`

```ts
matchTo(targetOrPairs: Shape | ShapeGroup | Array<[ Shape | ShapeGroup, string, string ]>, selfConnOrDict?: string | Record<string, string>, targetConnOrOptions?: string | MatchToOptions, maybeOptions?: MatchToOptions): ShapeGroup
```

**References**

#### `withReferences()` — Attach named placement references to this group. References survive normal transforms (translate/rotate/scale/mirror/transform).

```javascript
const bracket = group(
  { name: 'Left', shape: leftShape },
  { name: 'Right', shape: rightShape },
).withReferences({
  points: { mountCenter: [0, 0, 0] },
});
```

```ts
withReferences(refs: PlacementReferenceInput): ShapeGroup
```

#### `referenceNames()` — List named placement references carried by this group.

```ts
referenceNames(kind?: PlacementReferenceKind): string[]
```

#### `referencePoint()` — Resolve a named placement reference or built-in Anchor3D to a 3D point. Named refs take priority over built-in anchors.

```ts
referencePoint(ref: PlacementAnchorLike): [ number, number, number ]
```

**Other**

#### `clone()` — Return a deep-cloned ShapeGroup tree (refs copied).

```ts
clone(): ShapeGroup
```

#### `boundingBox()` — Return the combined 3D bounding box of all children.

```ts
boundingBox(): { min: [ number, number, number ]; max: [ number, number, number ]; }
```

#### `color()` — Return a copy of the group with the given display color applied to each child.

```ts
color(hex: string): ShapeGroup
```

**Legacy Aliases**

- `withPorts()` -> `withConnectors()`
- `portNames()` -> `connectorNames()`

### `SurfacePattern`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `body` | `string` | Function body: receives (u, v) in surface mm, returns height displacement. |
| `constants` | `Record<string, number>` | Named constants injected into the function. |

### `ShapeRef`

A first-class reference path over a shape's semantic faces and face relationships.

Created with `shape.ref("lid/back")`, then refined through methods such as `.point()` or `.edges()`. The reference stores intent as a readable path and resolves lazily against the current shape metadata.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | — |

**Methods:**

#### `resolve()` — Resolve this reference into its current faces, edges, or points.

```ts
resolve(): ShapeReferenceResolution
```

#### `kind()` — The resolved reference kind, such as `face`, `edge-set`, or [`point`](/docs/sketch#point).

```ts
get kind(): ShapeReferenceKind
```

#### `cardinality()` — Whether the reference currently resolves to zero, one, or many matches.

```ts
get cardinality(): ShapeReferenceCardinality
```

#### `status()` — Return the reference lifecycle status for the current shape state.

```ts
status(): ShapeReferenceStatus
```

#### `explain()` — Return a human-readable explanation of how this reference resolved.

```ts
explain(): string
```

#### `as()` — Name this derived reference so the same shape can resolve it by `shape.ref(name)`.

```ts
as(name: string): ShapeRef
```

#### `maybe()` — Return an optional reference that resolves to zero matches instead of throwing when missing.

```ts
maybe(): ShapeRef
```

#### `all()` — Mark that a multi-match reference is intentionally being used as a set.

```ts
all(): ShapeRef
```

#### `one()` — Require this reference to resolve to exactly one match.

```ts
one(): ShapeRef
```

#### `faces()` — Resolve this reference as one or more faces.

```ts
faces(): FaceRef[]
```

#### `face()` — Resolve this reference as exactly one face.

```ts
face(): FaceRef
```

#### `edges()` — Resolve this reference as one or more edges. Face references return boundary edges.

```ts
edges(): EdgeSegment[]
```

#### `edge()` — Resolve this reference as exactly one edge.

```ts
edge(): EdgeSegment
```

#### `points()` — Resolve this reference as one or more points. Faces use centers and edges use midpoints.

```ts
points(): Vec3[]
```

#### [`point()`](/docs/sketch#point) — Resolve this reference as exactly one point.

```ts
point(): Vec3
```

#### `toJSON()` — Return the structured JSON-friendly reference resolution.

```ts
toJSON(): ShapeReferenceResolution
```

#### `toString()` — Return a compact display form for this reference path.

```ts
toString(): string
```

---

## Constants

### `ANCHOR3D_NAMES`

### `verify`

- `that(label: string, check: () => boolean, message?: string): void` — Custom predicate check.
- `equal(label: string, actual: number, expected: number, tolerance?: number, message?: string): void` — Check that two numbers are approximately equal (within tolerance).
- `notEqual(label: string, actual: number, unexpected: number, tolerance?: number, message?: string): void` — Check that two numbers are NOT equal (differ by more than tolerance).
- `greaterThan(label: string, actual: number, min: number, message?: string): void` — Check that actual > min.
- `lessThan(label: string, actual: number, max: number, message?: string): void` — Check that actual < max.
- `inRange(label: string, actual: number, min: number, max: number, message?: string): void` — Check that min <= actual <= max.
- `centersCoincide(label: string, a: ShapeLike, b: ShapeLike, tolerance?: number): void` — Check that the bounding-box centers of two shapes coincide within tolerance (mm).
- `notColliding(label: string, a: ShapeLike, b: ShapeLike, searchLength?: number): void` — Check that two shapes do not collide (minGap > 0).
- `minClearance(label: string, a: ShapeLike, b: ShapeLike, minGap: number, searchLength?: number): void` — Check that a minimum clearance gap exists between two shapes.
- `parallel(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number): void` — Check that two face normals are parallel (within toleranceDeg degrees).
- `perpendicular(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number): void` — Check that two face normals are perpendicular (within toleranceDeg degrees).
- `coplanar(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number, toleranceMm?: number): void` — Check that a face is coplanar with (same plane as) another face, meaning they are parallel AND their centers lie on the same plane.
- `faceAt(label: string, face: FaceRefLike, expectedPos: [ number, number, number ], toleranceMm?: number): void` — Check that a face center lies at a specific position (within toleranceMm).
- `sameDirection(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number): void` — Check that two face normals point in the same direction (not antiparallel). Stricter than parallel — both |angle| AND sign must match.
- `isEmpty(label: string, shape: ShapeLike, message?: string): void` — Check that a shape is empty.
- `notEmpty(label: string, shape: ShapeLike, message?: string): void` — Check that a shape is NOT empty.
- `volumeApprox(label: string, shape: ShapeLike, expected: number, tolerance?: number): void` — Check that a shape's volume is approximately equal to expected (mm³).
- `areaApprox(label: string, shape: ShapeLike, expected: number, tolerance?: number): void` — Check that a shape's surface area is approximately equal to expected (mm²).
- `boundingBoxSize(label: string, shape: ShapeLike, expectedSize: [ number, number, number ], tolerance?: number): void` — Check that a shape's bounding box has approximately the given size.
- `edgeContinuity(label: string, shape: ShapeLike, options?: EdgeContinuityThresholds): void` — Check that every sampled seam on a shape meets a requested continuity threshold.
- `noTinyEdges(label: string, shape: ShapeLike, threshold?: number): void` — Check that a shape has no tiny edges below the requested threshold.
- `noSliverFaces(label: string, shape: ShapeLike, threshold?: number): void` — Check that a shape has no sliver faces below the requested score threshold.
- `noSelfIntersection(label: string, shape: ShapeLike): void` — Best-effort exact-shape validity guard for self-intersections or broken B-Rep topology.

### `Constraint`

- `makeParallel(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): ConstrainedSketchBuilder` — Constrain two lines to be parallel.
- `enforceAngle(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg, angleDeg: number): ConstrainedSketchBuilder` — Constrain the signed angle from line `a` to line `b`.
- `horizontal(builder: ConstrainedSketchBuilder, line: LineArg): ConstrainedSketchBuilder` — Constrain a line to be horizontal.
- `vertical(builder: ConstrainedSketchBuilder, line: LineArg): ConstrainedSketchBuilder` — Constrain a line to be vertical.
- `equalLength(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): ConstrainedSketchBuilder` — Constrain two lines to have equal length.
- `distance(builder: ConstrainedSketchBuilder, a: PointArg, b: PointArg, value: number): ConstrainedSketchBuilder` — Constrain the distance between two points.
- `fix(builder: ConstrainedSketchBuilder, pt: PointArg, x: number, y: number): ConstrainedSketchBuilder` — Fix a point at a specific coordinate.
- `coincident(builder: ConstrainedSketchBuilder, a: PointArg, b: PointArg): ConstrainedSketchBuilder` — Constrain two points to occupy the same location.
- `perpendicular(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): ConstrainedSketchBuilder` — Constrain two lines to be perpendicular.
- `length(builder: ConstrainedSketchBuilder, line: LineArg, value: number): ConstrainedSketchBuilder` — Constrain the length of a line.

### `Points`

- `distance(a: Vec3, b: Vec3): number` — Euclidean distance between two 3D points.
- `midpoint(a: Vec3, b: Vec3): Vec3` — Center point between two 3D points.
- `lerp(a: Vec3, b: Vec3, t: number): Vec3` — Linearly interpolate between two 3D points. t=0 returns a, t=1 returns b.
- `direction(a: Vec3, b: Vec3): Vec3` — Unit direction vector from a to b. Throws if a and b are the same point.
- `offset(point: Vec3, dir: Vec3, amount: number): Vec3` — Move a point along a direction vector by a given amount.
- `polar(length: number, angleDeg: number, from?: [ number, number ]): [ number, number ]` — Compute a 2D point at distance and angle (degrees) from an optional origin.

### `connector`

Connector factory. Create attachment points: `connector({...})`, `connector.male(type, {...})`, etc.

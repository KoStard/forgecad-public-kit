---
skill-group: core
skill-order: 100
---

# Core API

3D primitives, boolean operations, transforms, patterns, imports, and parameters.

## Contents

- [3D Primitives](#3d-primitives)
- [Boolean Operations](#boolean-operations)
- [Edge Features](#edge-features)
- [Patterns & Layout](#patterns-layout)
- [Imports & Composition](#imports-composition)
- [Parameters](#parameters)
- [Grouping & Local Coordinates](#grouping-local-coordinates)
- [Section & Projection](#section-projection)
- [Verification](#verification)
- [Shape](#shape) — Appearance, Face Topology, Edge Topology, Transforms, Booleans & Cutting, Features, Placement, Connectors, References, Measurement
- [Transform](#transform)
- [ShapeGroup](#shapegroup) — Children, Transforms, Placement, Connectors, References
- [SurfacePattern](#surfacepattern)
- [Pattern2D](#pattern2d)
- [Pattern2DBuilder](#pattern2dbuilder)
- [ShapeRef](#shaperef)
- [ANCHOR3D_NAMES](#anchor3d-names)
- [verify](#verify)
- [Points](#points)
- [connector](#connector)
- [Import](#import)

## Functions

### 3D Primitives

#### `box(width: number, depth: number, height: number): Shape` — Create a rectangular box. Centered on XY, base at Z=0.

All ForgeCAD dimensions are millimeters; all angles are degrees (applies to every API, not just `box`).

Extents:

- X: `[-width/2, width/2]`
- Y: `[-depth/2, depth/2]`
- Z: `[0, height]`

This origin convention (centered on XY, base at Z=0) applies to all volumetric primitives that have a base. There is no `center: true` option — recenter with `.translate(0, 0, -height/2)` or `.placeReference('center', [0, 0, 0])`.

For named faces, build from a labeled sketch: `rect(width, depth).labelEdges('s', 'e', 'n', 'w').extrude(height, { labels: { start: 'bottom', end: 'top' } })`.

#### `cylinder(height: number, radius: number, radiusTop?: number, segments?: number): Shape` — Create a cylinder or cone with named faces and edges. Centered on XY, base at Z=0.

Extents:

- X/Y: centered at the origin
- Z: `[0, height]`

`radiusTop` defaults to `radius`. Set `radiusTop` smaller to taper the side, or `0` for a pointy cone. Use `segments` to create regular prisms (for example `6` for a hexagonal prism).

Named faces: `top`, `bottom`, `side` Named edges: `top-rim`, `bottom-rim`

#### `sphere(radius: number, segments?: number): Shape` — Create a sphere centered at the origin.

Extents:

- X: `[-radius, radius]`
- Y: `[-radius, radius]`
- Z: `[-radius, radius]`

Use `segments` for lower-poly approximations.

#### `torus(majorRadius: number, minorRadius: number, segments?: number): Shape` — Create a torus (donut shape) lying in the XY plane. Centered on all axes.

Extents:

- X: `[-(majorRadius + minorRadius), +(majorRadius + minorRadius)]`
- Y: `[-(majorRadius + minorRadius), +(majorRadius + minorRadius)]`
- Z: `[-minorRadius, minorRadius]`

The origin is the center of the ring.

### Boolean Operations

#### `union(...inputs: ShapeOperandInput[]): Shape` — Combine shapes into a single solid (additive boolean).

Accepts individual shapes, or an array of shapes. `union()` returns one solid, so only the first operand's color is preserved in the result. Use `group()` when you want separate child colors or identities.

#### `difference(...inputs: ShapeOperandInput[]): Shape` — Subtract shapes from a base shape (subtractive boolean).

The first shape is the base; all subsequent shapes are subtracted from it. Accepts individual shapes, or an array of shapes.

#### `intersection(...inputs: ShapeOperandInput[]): Shape` — Keep only the overlapping volume of the input shapes (intersection boolean).

Requires at least two shapes. Accepts individual shapes, or an array.

### Edge Features

#### `fillet(shape: Shape, radius: number, edges?: EdgeSelector, segments?: number): Shape` — Apply experimental fillets (rounded edges) to one or more edges of a shape.

**Experimental**: edge finishes (fillet and chamfer) are backend-sensitive. The Manifold backend is known to produce incorrect results for some edge-finish cases, and the OCCT backend can be very slow, especially with broad edge selections. Prefer profile-level rounding where the design allows (`sketch.filletCorners(radius)` before extruding — exact and fast); otherwise use targeted edge selectors and inspect the result before treating it as production-ready geometry.

Edge selections compile into backend operations; unsupported selections fail as explicit kernel gaps instead of using TypeScript geometry fallbacks.

The `edges` parameter is flexible:

- Omit to fillet **all** sharp edges
- Pass an `EdgeQuery` for an inline filter (most common)
- Pass an `EdgeSegment` or `EdgeSegment[]` from `selectEdges()` for pre-selected edges
- Pass a tracked `EdgeRef` from `shape.edge('vert-br')` (vertical edges of `box()` / [`Rectangle2D`](/docs/sketch#rectangle2d) extrusions) — this takes the **exact** compiler-owned path, not the mesh-approximate one

Throws if no edges match the selection, or if `radius` is not a positive finite number.

```ts
// Fillet all edges
fillet(myShape, 2)

// Fillet only top convex edges
fillet(myShape, 1.5, { atZ: 20, convex: true })

// Fillet vertical edges selected beforehand
const edges = selectEdges(myShape, { parallel: [0, 0, 1] })
fillet(myShape, 3, edges)

// Exact compiler-owned fillet on a tracked box edge
const base = box(50, 50, 20)
fillet(base, 5, base.edge('vert-br'))
```

#### `chamfer(shape: Shape, size: number, edges?: EdgeSelector): Shape` — Apply experimental chamfers (beveled edges) to one or more edges of a shape.

**Experimental**: same backend caveats as `fillet` — Manifold may be incorrect for some edge-finish cases, OCCT can be very slow on broad selections; prefer profile-level rounding or targeted selectors and inspect the result.

Produces a 45° bevel at the specified `size` (distance from edge). Edge selections compile into backend operations; unsupported selections fail as explicit kernel gaps instead of using TypeScript geometry fallbacks.

The `edges` parameter accepts the same options as `fillet()`: inline `EdgeQuery`, pre-selected `EdgeSegment`/`EdgeSegment[]`, a tracked `EdgeRef` from `shape.edge('vert-br')` (exact compiler-owned path), or `undefined` (all sharp edges).

```ts
// Chamfer all edges
chamfer(myShape, 1)

// Chamfer only vertical edges
chamfer(myShape, 2, { parallel: [0, 0, 1] })

// Exact compiler-owned chamfer on a tracked box edge
const base = box(50, 50, 20)
chamfer(base, 3, base.edge('vert-br'))
```

#### `draft(shape: Shape, angleDeg: number, pullDirection?: Vec3, neutralPlaneOffset?: number): Shape` — Apply a draft angle (taper) to vertical faces for mold extraction.

Adds a taper angle to the vertical faces of a solid so that it can be extracted from a mold. The neutral plane is the Z position where the draft angle is zero — faces above and below are tapered symmetrically. Typical values for injection molding are 1–5°.

Truck supports vertical-prism solids with Z-axis pull directions. OCCT uses its native draft operation when available. Manifold throws.

```ts
// Add 3° draft to a box for injection molding
draft(myBox, 3)

// Draft with custom pull direction and neutral plane
draft(myShape, 2, [0, 0, 1], 10)
```

#### `offsetSolid(shape: Shape, thickness: number): Shape` — Uniformly offset all surfaces of a solid inward or outward.

Unlike `shell()`, which hollows a solid by removing one face, `offsetSolid()` produces a new solid whose every surface is shifted by `thickness`. Positive values grow the shape outward; negative values shrink it inward.

Requires the OCCT backend. Throws on Manifold.

```ts
// Grow a box outward by 1mm on all sides
offsetSolid(myBox, 1)

// Shrink a shape inward by 0.5mm
offsetSolid(myShape, -0.5)
```

### Patterns & Layout

#### `circularLayout(count: number, radius: number, options?: CircularLayoutOptions): LayoutPoint[]` — Compute evenly-spaced positions around a circle.

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

**`CircularLayoutOptions`**
- `startDeg?: number` — Angle of the first element in degrees (default: 0 = +X axis).
- `centerX?: number` — Center X coordinate (default: 0).
- `centerY?: number` — Center Y coordinate (default: 0).

`LayoutPoint`: `{ x: number, y: number }`

#### `polygonVertices(sides: number, radius: number, options?: PolygonVerticesOptions): LayoutPoint[]` — Compute the vertex positions of a regular polygon.

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

**`PolygonVerticesOptions`**
- `startDeg?: number` — Angle of the first vertex in degrees (default: 90 = top).
- `centerX?: number` — Center X coordinate (default: 0).
- `centerY?: number` — Center Y coordinate (default: 0).

#### `linearPattern(shape: Shape, count: number, dx: number, dy: number, dz?: number): Shape` — Repeat a shape in a linear pattern along a direction vector and union the copies.

Creates `count` copies of `shape`, each offset by `(dx*i, dy*i, dz*i)` from the original. All copies are unioned into a single `Shape`. Distinct compiler ownership is assigned to each copy so face identity via owner-scoped canonical queries still works post-merge.

```ts
// 5 cylinders, 20mm apart along X
linearPattern(cylinder(10, 3), 5, 20, 0)
```

#### `circularPattern(shape: Shape, count: number, centerXOrOpts?: number | CircularPatternOptions, centerY?: number): Shape` — Repeat a shape in a circular pattern around an axis and union the copies.

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

**`CircularPatternOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `centerX?` | `number` | Center X of the rotation (default: 0). Used when the rotation axis is Z. |
| `centerY?` | `number` | Center Y of the rotation (default: 0). Used when the rotation axis is Z. |
| `axis?` | `Vec3` | Rotation axis direction (default: [0, 0, 1] = Z axis). |
| `origin?` | `Vec3` | Pivot point for the rotation (default: [0, 0, 0]). Overrides centerX/centerY when set. |

#### `linearPattern2d(sketch: Sketch, count: number, dx: number, dy?: number): Sketch` — Repeat a 2D sketch in a linear pattern and union the copies.

#### `circularPattern2d(sketch: Sketch, count: number, centerXOrOpts?: number | { centerX?: number; centerY?: number; startDeg?: number; }, centerY?: number): Sketch` — Repeat a 2D sketch in a circular pattern around a center point and union the copies.

#### `mirrorCopy(shape: Shape, normal: Vec3): Shape` — Mirror a shape across a plane and union the mirror with the original.

The mirror plane passes through the origin and is defined by its normal vector. The mirrored copy is unioned with the original to produce a single symmetric Shape.

```ts
// Mirror across the YZ plane (X=0)
mirrorCopy(box(50, 30, 10), [1, 0, 0])
```

#### `selectEdges(shape: Shape, query?: EdgeQuery): EdgeSegment[]` — Select all edges from a shape that match the given query.

Uses the active kernel's native topology query when available (Truck), otherwise extracts sharp edges from the mesh (dihedral angle > 1°), applies all filters in the query, and returns the matching `EdgeSegment[]`. When `near` is specified the results are sorted closest-first.

Works on any shape — primitives, booleans, shells, and imported meshes. Use this when tracked topology is unavailable (e.g. after a difference or on imported geometry). For simpler cases, pass an `EdgeQuery` directly to `fillet()` or `chamfer()` instead of calling `selectEdges` separately.

```ts
// Fillet all top edges of a box
const topEdges = selectEdges(part, { atZ: 20, perpendicular: [0, 0, 1] });
let result = part;
for (const edge of coalesceEdges(topEdges)) {
  result = fillet(result, 2, edge);
}
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
| `atZ?` | `number` | Shorthand: edge midpoint Z is approximately this value within `tolerance`. |
| `tolerance?` | `number` | Position tolerance for approximate matches. Used by `atZ` and `near`. Default: `1.0`. |
| `angleTolerance?` | `number` | Angular tolerance in degrees for `parallel`/`perpendicular` filters. Default: `10`. |

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

Also: `start: Vec3`, `end: Vec3`, `midpoint: Vec3`, `length: number`.

#### `selectEdge(shape: Shape, query?: EdgeQuery): EdgeSegment` — Select the single best-matching edge from a shape.

When `near` is specified, returns the edge whose midpoint is closest to that point. Otherwise returns the first matching edge in mesh order. Throws if no edges match the query — useful as a guard when you expect exactly one result.

```ts
// Chamfer one specific edge near a known point
const bottomEdge = selectEdge(part, { near: [25, 0, 0], atZ: 0 });
result = chamfer(result, 1.5, bottomEdge);
```

#### `coalesceEdges(segments: EdgeSegment[], tolerance?: number): EdgeSegment[]` — Merge collinear edge segments into longer logical edges.

Tessellation often splits one geometric edge into multiple short segments. `coalesceEdges` groups adjacent collinear segments and merges each group into a single `EdgeSegment` spanning the full extent. This is usually needed before passing edges to `fillet()` or `chamfer()` on non-primitive shapes.

The `tolerance` controls the maximum perpendicular distance from collinearity before two segments are considered non-collinear. Default: `0.01`.

```ts
const topEdges = selectEdges(part, { atZ: 20 });
for (const edge of coalesceEdges(topEdges)) {
  result = fillet(result, 2, edge);
}
```

### Imports & Composition

#### `require(path: string, paramOverrides?: Record<string, number | string>): any` — Import a module with optional ForgeCAD parameter overrides. Returns the module's exports.

When importing a `.forge.js` file, most return values are passed through exactly as the script returns them. Assembly returns have one extra composition rule: an unsolved [`Assembly`](/docs/assembly#assembly) is wrapped as an [`ImportedAssembly`](/docs/assembly#importedassembly), preserving `solve(state)` and `mergeInto()` across file boundaries, while a returned [`SolvedAssembly`](/docs/assembly#solvedassembly) stays a [`SolvedAssembly`](/docs/assembly#solvedassembly). If the script returns a metadata object (e.g. `{ shape: myShape, bolts: {...} }`), the caller receives the full object — renderable values and metadata together.

**Script return contract:** a `.forge.js` script returns one of three shapes: a single renderable (Shape, ShapeGroup, Sketch, SdfShape, Assembly), an array of renderables or named descriptors (`{ name, shape|sketch|group }`), or a metadata object mixing renderable values with plain data. When a script runs directly, renderable entries of a metadata object are rendered under their key names and non-renderable entries are silently skipped — both halves of the metadata contract: one return value serves the viewport and `require()` callers.

**Assembly return contract**

| `.forge.js` return value | `require()` result |
|---|---|
| `Assembly` | `ImportedAssembly` |
| `SolvedAssembly` | `SolvedAssembly` |

[`ImportedAssembly`](/docs/assembly#importedassembly) exposes default-pose helpers such as `getPart()`, `collisionReport()`, and `minClearance()`. Use `solve(state)` first when inspecting a non-default pose.

**Path rule:** Always include the file extension in relative imports: use `require("./part.forge.js")` for model files and `require("./helpers.js")` for plain helper modules. ForgeCAD does not apply Node-style extension inference, so `require("./part")` will not find `part.forge.js` or `part.js`.

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

**Forge-aware builder module pattern** — use `.forge.js` modules for reusable sketch, profile, shape, or assembly builders that need ForgeCAD runtime APIs:

```js
// profiles.forge.js — inspectable on its own, reusable through require()
function wheelProfile() {
  return circle2d(40).subtract(circle2d(18));
}

return {
  preview: [{ name: 'Wheel profile', sketch: wheelProfile() }],
  make: { wheelProfile },
};

// main.forge.js
const profiles = require('./profiles.forge.js');
const wheel = profiles.make.wheelProfile().extrude(8);
```

Keep exported builders pure over top-level constants, top-level `param()` values, or explicit function arguments. Do not declare new `param()` values inside an exported builder if callers need `require('./profiles.forge.js', { Width: 80 })` overrides: import overrides are validated while the module loads, before any exported builder is called. Use plain `.js` modules only for pure constants, tables, math helpers, and formatting code that does not construct ForgeCAD geometry.

**Entry detection (Node semantics):** `require.main` is the entry script's module object, so `require.main === module` is true only in the file being run directly. Part files use it to build standalone preview geometry only when opened directly — importers then skip that work entirely:

```js
// part.forge.js
function bracket() { ... }
if (require.main === module) {
  return { preview: [{ name: 'Bracket', shape: bracket() }] }; // direct run: render it
}
return { make: { bracket } };                                  // imported: builders only
```

### Parameters

#### `Param.number(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean; }): number` — Declare a numeric parameter that renders as a slider in the UI.

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

#### `Param.string(name: string, defaultValue: string, opts?: { maxLength?: number; }): string` — Declare a string parameter that renders as a text input in the UI.

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

#### `Param.bool(name: string, defaultValue: boolean): boolean` — Declare a boolean parameter that renders as a checkbox in the UI.

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

#### `Param.choice(name: string, defaultValue: string, choices: string[]): string` — Declare a choice parameter that renders as a dropdown in the UI.

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

#### `Param.list<T extends Record<string, number | boolean | string>>(name: string, defaultItems: T[], opts: { ... }): T[]` — Declare a list parameter — an array of struct items with per-field UI controls.

Each item in the list is a struct whose fields each render as their own control (slider, checkbox, or dropdown). The user can add/remove rows up to `minItems`/`maxItems` bounds.

Field types:

- Boolean fields (`boolean: true` in field defs) return as `boolean`
- Choice fields (`choices: [...]` in field defs) return as `string`
- All other fields return as `number`

`ListParamFieldDef`: `{ min?: number, max?: number, step?: number, unit?: string, integer?: boolean, boolean?: boolean, choices?: string[] }`

### Grouping & Local Coordinates

#### `group(...items: GroupInput[]): ShapeGroup` — Group multiple shapes/sketches for joint transforms without merging into a single mesh.

Unlike union(), child colors and individual identities are preserved. Children can be plain shapes, named descriptors ({ name, shape/sketch/group }), or nested groups. The returned ShapeGroup supports all Shape transforms (translate, rotate, etc.).

Named descriptors can include `tags` for viewport organization. Tags do not affect geometry; they let the command palette hide, show only, or focus all objects with the same tag.

**Local coordinate pattern:** Build child parts at the origin (local coordinates), then group and translate once to place the whole assembly. This eliminates the error-prone pattern of manually adding parent offsets to every sub-part.

```js
const body = roundedBox(100, 20, 32, 4);
const panel = box(98, 2, 18).translate(0, -12, 4);
const louver = box(88, 2, 6).translate(0, -14, -11);
const indoorUnit = group(
  { name: 'Body', shape: body },
  { name: 'Panel', tags: 'cover', shape: panel },
  { name: 'Louver', tags: ['cover', 'moving'], shape: louver },
).translate(0, -18, 70);
```

### Section & Projection

#### `intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch` — Cross-section: slice a 3D shape with a plane and return the intersection as a 2D Sketch.

#### `faceProfile(shape: Shape, face: FaceSelector): Sketch` — Extract the boundary profile of a named face as a 2D sketch.

The result is returned in the face's local 2D coordinate system, making it convenient for offsets, pocket profiles, or follow-up sketch operations driven by an existing face.

#### `projectToPlane(shape: Shape, plane: PlaneSpec): Sketch` — Orthographically project a 3D shape onto a plane and return the silhouette as a 2D Sketch.

### Verification

#### `verify.that(label: string, check: () => boolean, message?: string): void` — Custom predicate check.

#### `verify.equal(label: string, actual: number, expected: number, tolerance?: number, message?: string): void` — Check that two numbers are approximately equal (within tolerance).

#### `verify.notEqual(label: string, actual: number, unexpected: number, tolerance?: number, message?: string): void` — Check that two numbers are NOT equal (differ by more than tolerance).

#### `verify.greaterThan(label: string, actual: number, min: number, message?: string): void` — Check that actual > min.

#### `verify.lessThan(label: string, actual: number, max: number, message?: string): void` — Check that actual < max.

#### `verify.inRange(label: string, actual: number, min: number, max: number, message?: string): void` — Check that min <= actual <= max.

#### `verify.centersCoincide(label: string, a: ShapeLike, b: ShapeLike, tolerance?: number): void` — Check that the bounding-box centers of two shapes coincide within tolerance (mm).

`ShapeLike`: `{ min: number[], max: number[] }`

#### `verify.connectorDistance(label: string, target: ConnectorDistanceLike, connectorA: string, connectorB: string, expected?: number, tolerance?: number): void` — Check the distance between two named connectors on a shape or group.

Use this when connectors + `matchTo()` define a static assembly interface. It proves the mate at runtime, unlike a plain source-level connector declaration. The common case is `expected = 0`, meaning the two connector origins should coincide after placement.

```ts
verify.connectorDistance("leg is seated", bench, "Rail.leg_0", "Leg0.head", 0, 0.01);
```

#### `verify.physicalComponentCount(label: string, expected: number): void` — Declare the expected physical connectivity component count for the returned visible model.

Use this for generated mechanical models that should have a clear component graph: one connected fixture, a purchased part plus a removable cartridge, a root assembly plus named intentional ghosts, and so on. `forgecad inspect mechanical-integrity` resolves the returned visible objects with the same physical-connectivity analysis used in the quality gate and fails if the actual component count differs.

This catches the common generated-CAD failure where a script returns a visually plausible artifact but the handle, screw, washer, cover, or terminal block is actually a separate island.

```ts
verify.physicalComponentCount("vise is one connected installed assembly", 1);
```

#### `verify.intentionalOverlap(label: string, a: ShapeLike, b: ShapeLike, reason: string): void` — Declare that two visible objects intentionally overlap because the overlap is real manufacturing intent.

Use this only for overlaps that a mechanical reviewer would accept as actual matter sharing volume: welded/fused regions, overmolded inserts, potted electronics, cast-in hardware, or deliberately bonded laminations. This is not a shortcut for screws without holes, shafts without bores, covers without pockets, or parts placed with collision as a positioning hack.

`forgecad inspect mechanical-integrity --collisions` only honors this declaration when both shapes are returned as visible objects and the exact collision report finds that same object pair. Unused or non-visible declarations fail the quality gate so annotations cannot hide unrelated collisions.

```ts
verify.intentionalOverlap("rubber grip is overmolded on handle", rubberGrip, handleCore, "overmolded insert");
```

#### `verify.notColliding(label: string, a: ShapeLike, b: ShapeLike, searchLength?: number): void` — Check that two shapes do not share positive volume.

Face-to-face contact is allowed; use `verify.minClearance()` when an actual running gap is required.

#### `verify.minClearance(label: string, a: ShapeLike, b: ShapeLike, minGap: number, searchLength?: number): void` — Check that a minimum clearance gap exists between two shapes.

#### `verify.clearanceBetween(label: string, a: ShapeLike, b: ShapeLike, minGap: number, maxGap: number, searchLength?: number): void` — Check that the clearance gap between two shapes is inside an allowed range.

Use this for seated and retained interfaces where a part must be close enough to be mechanically accountable, but must not collide beyond the allowed minimum. It catches both failure modes that make generated CAD look fake: parts floating away from their receiver, and parts intersecting their receiver because the pocket, bore, or running clearance was not modeled.

For contact, use a narrow range such as `[-0.01, 0.05]` to tolerate tiny numerical noise. For a running fit, use the intended clearance band.

Manifold-backed shapes use exact min-gap distance. Other backends use a mesh-derived min-gap check and say so in the verification message; keep `forgecad inspect mechanical-integrity --collisions` in the acceptance gate for positive-volume interference.

```ts
verify.clearanceBetween("cover is seated on gasket", cover, gasket, -0.01, 0.05);
verify.clearanceBetween("carriage runs inside rail", carriage, rail, 0.2, 0.5);
```

#### `verify.parallel(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number): void` — Check that two face normals are parallel (within toleranceDeg degrees).

`FaceRefLike`: `{ normal: Vec3, center: Vec3 }`

#### `verify.perpendicular(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number): void` — Check that two face normals are perpendicular (within toleranceDeg degrees).

#### `verify.coplanar(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number, toleranceMm?: number): void` — Check that a face is coplanar with (same plane as) another face, meaning they are parallel AND their centers lie on the same plane.

#### `verify.faceAt(label: string, face: FaceRefLike, expectedPos: Vec3, toleranceMm?: number): void` — Check that a face center lies at a specific position (within toleranceMm).

#### `verify.sameDirection(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg?: number): void` — Check that two face normals point in the same direction (not antiparallel). Stricter than parallel — both |angle| AND sign must match.

#### `verify.isEmpty(label: string, shape: ShapeLike, message?: string): void` — Check that a shape is empty.

#### `verify.notEmpty(label: string, shape: ShapeLike, message?: string): void` — Check that a shape is NOT empty.

#### `verify.volumeApprox(label: string, shape: ShapeLike, expected: number, tolerance?: number): void` — Check that a shape's volume is approximately equal to expected (mm³).

#### `verify.areaApprox(label: string, shape: ShapeLike, expected: number, tolerance?: number): void` — Check that a shape's surface area is approximately equal to expected (mm²).

#### `verify.boundingBoxSize(label: string, shape: ShapeLike, expectedSize: Vec3, tolerance?: number): void` — Check that a shape's bounding box has approximately the given size.

#### `verify.edgeContinuity(label: string, shape: ShapeLike, options?: EdgeContinuityThresholds): void` — Check that every sampled seam on a shape meets a requested continuity threshold.

**`EdgeContinuityThresholds`**: `continuity?: SurfaceContinuity`, `samples?: number`, `positionTolerance?: number`, `tangentToleranceDeg?: number`, `curvatureTolerance?: number`

#### `verify.noTinyEdges(label: string, shape: ShapeLike, threshold?: number): void` — Check that a shape has no tiny edges below the requested threshold.

#### `verify.noSliverFaces(label: string, shape: ShapeLike, threshold?: number): void` — Check that a shape has no sliver faces below the requested score threshold.

#### `verify.noSelfIntersection(label: string, shape: ShapeLike): void` — Best-effort exact-shape validity guard for self-intersections or broken B-Rep topology.

#### `spec(name: string, checkFn: (...args: any[]) => void): Spec` — Create a named, reusable bundle of verification checks.

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
| `materialProps` | `ShapeMaterialProps \| undefined` | — |

**Appearance**

#### `color(value: string | undefined): Shape` — Set the color of this shape (hex string, e.g. "#ff0000"). Returns a new Shape with the color applied.

#### `material(props: ShapeMaterialProps): Shape` — Set PBR material properties for this shape's visual appearance.

Returns a new Shape with the specified material properties merged on top of any previously set properties. All properties are optional — omitted keys retain their current value. Material properties survive transforms and boolean operations.

Use `.color()` to set the base diffuse color; `.material()` controls how that color behaves under light (metalness, roughness, clearcoat) and can add emissive glow independent of lighting. Emissive glow pairs naturally with the `postProcessing.bloom` effect in [`scene()`](/docs/viewport#scene).

```js
box(50, 50, 50).material({ metalness: 0.9, roughness: 0.1 }); // polished metal
sphere(30).material({ emissive: '#ff6b35', emissiveIntensity: 2 }); // glowing
cylinder(40, 20).material({ opacity: 0.4, clearcoat: 1.0, clearcoatRoughness: 0.02 }); // ice

// Chainable with other shape methods
box(100, 100, 10).color('#gold').material({ metalness: 0.95, roughness: 0.05 }).translate(0, 0, 50);
```

**`ShapeMaterialProps`**

| Option | Type | Description |
|--------|------|-------------|
| `metalness?` | `number` | Metalness factor (0 = dielectric, 1 = metal). Default: 0.05 |
| `roughness?` | `number` | Roughness factor (0 = mirror, 1 = fully diffuse). Default: 0.35 |
| `emissive?` | `string` | Emissive glow color (hex string, e.g. "#ff6b35"). |
| `emissiveIntensity?` | `number` | Emissive intensity multiplier. Default: 1 |
| `opacity?` | `number` | Opacity (0 = fully transparent, 1 = fully opaque). Default: 1 |
| `wireframe?` | `boolean` | Render as wireframe. Default: false |
| `clearcoat?` | `number` | Clearcoat intensity (0–1). Default: 0.1 |
| `clearcoatRoughness?` | `number` | Clearcoat roughness (0–1). Default: 0.4 |
| `transmission?` | `number` | Glass/translucency transmission factor (0–1). Renderer support depends on target. |
| `ior?` | `number` | Index of refraction for transmissive materials. Typical glass is ~1.45. |
| `thickness?` | `number` | Approximate transmissive volume thickness in model units. |
| `specularIntensity?` | `number` | Specular highlight intensity (0–1). |
| `specularColor?` | `string` | Specular highlight tint. |
| `reflectivity?` | `number` | Reflection strength for supported renderers (0–1). |

**Face Topology**

#### `face(selector: FaceSelector): FaceRef` — Resolve a face by user-authored label or compiler-owned name. Returns a `FaceRef` that can be passed to `.onFace()`, `projectToPlane()`, or used directly in placement.

`.face(name)` is a pure label lookup — it finds faces by user-authored labels, not by geometric queries. Labels are born in sketches via `.label()` / `.labelEdges()` and grow into face names through extrude, loft, revolve, and sweep. They are stable references that travel with the geometry.

Labels must be unique within a shape. Use `.prefixLabels()` before combining shapes with `union()` / `difference()` to avoid collisions. Collision detection throws a clear error with a fix suggestion.

Boolean survival: `union()` and `intersection()` carry labels from every operand; `difference()` carries only the base (first) operand's labels — cutter labels are dropped. A surviving label addresses whatever portion of its face survives the boolean; cutters may split or erase it, and a lineage shared by multiple union operands resolves as a face set rather than a single face.

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

#### `faces(): FaceRef[]` — Return faces matching a query, or label semantic faces when passed a mapping.

Mapping form returns a new shape: `shape.faces({ lid: 'top', walls: ['front', 'back', 'left', 'right'] })`.

#### `faceNames(): string[]` — List defined semantic face names currently available on this shape.

#### `prefixLabels(prefix: string): Shape` — Prefix all user-authored face labels, including semantic labels from `faces(mapping)`. Returns a new shape with modified labels.

#### `renameLabel(from: string, to: string): Shape` — Rename a single face label. Returns a new shape.

#### `dropLabels(...names: string[]): Shape` — Remove specific face labels. Returns a new shape.

#### `dropAllLabels(): Shape` — Remove all face labels. Returns a new shape.

#### `faceHistory(name: string): FaceTransformationHistory` — Get the transformation history for a specific face.

**Edge Topology**

#### `edge(name: string): EdgeRef` — Get a named topology edge. Only available on shapes with tracked topology (from box/cylinder/extrude).

#### `edgeNames(): string[]` — List named topology edge names. Returns empty array if shape has no tracked topology.

#### `edgesOf(faceLabel: string, options?: EdgesOfOptions): EdgeSegment[]` — Return all boundary edges of a named face.

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

**`EdgesOfOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `exclude?` | `string \| string[]` | Exclude edges shared with these named faces. |
| `convex?` | `boolean` | Additional geometric filter: only convex edges. |
| `concave?` | `boolean` | Additional geometric filter: only concave edges. |
| `minLength?` | `number` | Minimum edge length filter. |

#### `edgesBetween(faceA: string, faceB: string | string[]): EdgeSegment[]` — Return edges shared between two named faces.

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

**Transforms**

#### `translate(x: number, y: number, z: number): Shape` — Move the shape relative to its current position. All transforms are immutable and return new shapes.

#### `translatePolar(radius: number, angleDeg: number, z?: number): Shape` — Translate using polar coordinates (radius + angle in degrees). Eliminates manual `r * Math.cos(angle * PI/180)` calculations.

Example: `shape.translatePolar(50, 30)` moves 50mm at 30 degrees from +X.

#### `moveTo(x: number, y: number, z: number): Shape` — Position the shape so its bounding box min corner is at the given global coordinate.

#### `moveToLocal(target: Shape | { toShape(): Shape; }, x: number, y: number, z: number): Shape` — Position the shape relative to another shape's local coordinate system (bounding box min corner).

#### `rotate(axis: Vec3, angleDeg: number, options?: { pivot?: Vec3; }): Shape` — Rotate around an arbitrary axis through the origin. Unlike `Sketch.rotate()` (bounding-box center), this pivots at the world origin — pass `options.pivot` to rotate in place.

#### `rotateX(angleDeg: number, options?: { pivot?: Vec3; }): Shape` — Rotate around the X axis by the given angle in degrees.

#### `rotateY(angleDeg: number, options?: { pivot?: Vec3; }): Shape` — Rotate around the Y axis by the given angle in degrees.

#### `rotateZ(angleDeg: number, options?: { pivot?: Vec3; }): Shape` — Rotate around the Z axis by the given angle in degrees.

#### `rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: RotationPointLike, targetPoint: RotationPointLike, options?: RotateAroundToOptions): Shape` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. `movingPoint` / `targetPoint` may be raw world points or this shape's anchors/references.

`RotateAroundToOptions`: `{ mode?: RotateAroundToMode }`

#### `transform(m: Mat4 | Transform): Shape` — Apply a 4x4 affine transform matrix (column-major) or a Transform object.

#### `scale(v: number | Vec3): Shape` — Scale the shape uniformly or per-axis from the shape's bounding box center. Accepts a single number or [x, y, z] array.

#### `scaleAround(pivot: Vec3, v: number | Vec3): Shape` — Scale the shape uniformly or per-axis from an explicit pivot point.

#### `mirror(normal: Vec3): Shape` — Mirror across a plane through the shape's bounding box center, defined by its normal vector.

#### `mirrorThrough(point: Vec3, normal: Vec3): Shape` — Mirror across a plane through an explicit point, defined by its normal vector.

#### `pointAlong(direction: Vec3): Shape` — Reorient a shape so its primary axis (Z) points along the given direction. Useful for laying cylinders/extrusions along X or Y without thinking about Euler angles. The shape's origin stays at [0,0,0] — translate after pointAlong to position it.

Example: cylinder(40, 5).pointAlong([1, 0, 0]) — lays cylinder along X, starting at origin

**Booleans & Cutting**

#### `add(...others: ShapeOperandInput[]): Shape` — Union this shape with others (additive boolean). Method form of union().

#### `subtract(...others: ShapeOperandInput[]): Shape` — Subtract other shapes from this one. Method form of difference().

#### `intersect(...others: ShapeOperandInput[]): Shape` — Keep only the overlap with other shapes. Method form of intersection().

#### `split(cutter: Shape | { toShape(): Shape; }): [ Shape, Shape ]` — Split into [inside, outside] by another shape.

#### `splitByPlane(normal: Vec3, originOffset?: number): [ Shape, Shape ]` — Split by infinite plane. Returns [positive-side, negative-side].

#### `trimByPlane(normal: Vec3, originOffset?: number): Shape` — Keep the positive side of the plane and discard the opposite side.

**Features**

#### `shell(thickness: number, opts?: { openFaces?: string[]; }): Shape` — Hollow out compile-covered boxes, cylinders, and straight extrudes. `openFaces` names any subset of the base shape's labeled faces to leave open (no wall).

#### `pocket(face: FaceSelector, depth: number, opts?: PocketOptions): Shape` — Cut a pocket (cavity) into this solid through the named face.

```js
box(100, 100, 20).pocket('top', 8)
box(100, 100, 20).pocket('top', 8, { inset: 5 })
box(100, 100, 20).pocket('top', 8, { scale: 0.8 })
```

**`PocketOptions`**
- `inset?: number` — Shrink the face boundary inward by this many mm before extruding. Produces angled walls when combined with depth. Default: 0 (full face).
- `scale?: number` — Scale the face profile uniformly (e.g. 0.8 = 80% of the face area). Mutually exclusive with `inset`; `inset` takes precedence if both are set.
- `join?: "Square" | "Round" | "Miter"` — Corner join style when using `inset`. Default: 'Round'.

#### `boss(face: FaceSelector, height: number, opts?: BossOptions): Shape` — Add a boss (protrusion) from the named face.

```js
box(100, 100, 20).boss('top', 5)
box(100, 100, 20).boss('top', 10, { scale: 0.6 })
```

#### `hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape` — Drill a hole into this solid at a face.

```js
box(50, 50, 20).hole('top', { diameter: 8, depth: 10 })
box(50, 50, 20).hole('top', { diameter: 6, counterbore: { diameter: 12, depth: 3 } })
```

**`FaceRef`**

| Option | Type | Description |
|--------|------|-------------|
| `normal` | `Vec3` | Normal direction of the face |
| `center` | `Vec3` | Center point of the face |
| `query?` | `FaceQueryRef` | Compiler-owned face query when available. |
| `planar?` | `boolean` | True when the face can host a 2D sketch placement frame |
| `uAxis?` | `Vec3` | Face-local horizontal axis for planar faces |
| `vAxis?` | `Vec3` | Face-local vertical axis for planar faces |
| `surface?` | `FaceSurface` | Analytic surface family when the backend can identify one. |
| `descendant?` | `FaceDescendantMetadata` | Shared descendant-resolution metadata when this face is a semantic region/set. |

Also: `name: FaceName`.

**`FaceDescendantMetadata`**: `kind: "single" | "face-set"`, `semantic: FaceDescendantSemantic`, `memberCount: number`, `memberNames: string[]`, `coplanar: boolean`

**`ShapeHoleOptions`**: `diameter: number`, `depth?: number`, `upToFace?: SketchFaceTarget | FaceRef`, `extent?: ShapeFeatureExtentOptions`, `u?: number`, `v?: number`, `counterbore?: { diameter: number; depth: number; }`, `countersink?: { diameter: number; angleDeg?: number; }`, `thread?: ShapeHoleThreadOptions`

`ShapeFeatureExtentOptions`: `{ forward: ShapeFeatureExtentSideOptions, reverse?: ShapeFeatureExtentSideOptions }`

`ShapeFeatureExtentSideOptions`: `{ depth?: number, upToFace?: SketchFaceTarget | FaceRef, through?: boolean }`

**`ShapeHoleThreadOptions`**: `designation?: string`, `pitch?: number`, `class?: string`, `handedness?: "right" | "left"`, `depth?: number`, `modeled?: boolean`

#### `cutout(sketch: Sketch, opts?: ShapeCutoutOptions): Shape` — Cut a profile-shaped pocket through a face using a placed sketch.

The sketch must be placed on a face with `Sketch.onFace(...)`. The cut follows the sketch's 2D profile.

```js
const profile = circle2d(10).onFace(body, 'top');
body.cutout(profile, { depth: 5 })
```

**`ShapeCutoutOptions`**: `depth?: number`, `upToFace?: SketchFaceTarget | FaceRef`, `extent?: ShapeFeatureExtentOptions`, `taperScale?: number | Vec2`

**Placement**

#### `placeReference(ref: PlacementAnchorLike, target: Vec3, offset?: Vec3): Shape` — Translate the shape so the given anchor or reference lands on the target coordinate.

Accepts any built-in anchor name (`'bottom'`, `'center'`, `'top-front-left'`, etc.) or a custom placement reference attached via `withReferences()`.

```javascript
// Ground a shape — put its bottom face center at Z = 0
shape.placeReference('bottom', [0, 0, 0])

// Center at the world origin
shape.placeReference('center', [0, 0, 0])

// Align left edge to X = 10
shape.placeReference('left', [10, 0, 0])
```

#### `attachTo(target: ShapeAnchorTarget, targetAnchor: PlacementAnchorLike, selfAnchor?: PlacementAnchorLike, offset?: Vec3): Shape` — Position this shape relative to another using named 3D anchor points.

Anchors are bounding-box-relative: 'center', face centers ('top', 'front', ...), edge midpoints ('top-front', 'back-left', ...), and corners ('top-front-left', ...). Anchor word order is flexible: 'front-left' and 'left-front' are equivalent. Named placement references (from withReferences) can also be used as anchors.

#### `onFace(parent: ShapeAnchorTarget, face: "front" | "back" | "left" | "right" | "top" | "bottom", opts?: { u?: number; v?: number; protrude?: number; }): Shape` — Place this shape on a face of a parent shape.

Think of it like sticking a label on a box surface:

- `face` picks which surface ('front', 'back', 'top', etc.)
- `u, v` position within that face's 2D plane (from center)
- front/back: u = left/right (X), v = up/down (Z)
- left/right: u = forward/back (Y), v = up/down (Z)
- top/bottom: u = left/right (X), v = forward/back (Y)
- `protrude` = how far the child sticks out (positive = outward from face)

#### `seatInto(target: Shape, surface: string, options?: SeatIntoOptions): Shape` — Slide this shape along an axis until a labeled face is embedded in the target body.

Position the shape roughly first (translate/rotate), then call seatInto to auto-adjust the penetration depth. No manual coordinate math needed.

```js
// Wing root embeds into fuselage — adapts to any fuselage shape
wing.translate(0, wingY, 0).seatInto(fuselage, 'root');

// Sensor pod sits flush on fuselage surface
pod.translate(0, station, radius + 20).seatInto(fuselage, 'base', { depth: 'flush' });

// Antenna with 3mm gasket standoff
mast.translate(0, station, radius + 50).seatInto(fuselage, 'mount', { depth: 'flush', gap: 3 });
```

**`SeatIntoOptions`**
- `along?: Vec3` — Movement axis. Default: inverted face normal (points into target).
- `depth?: "full" | "flush" | number` — How deep to embed. 'full' = entire face inside. 'flush' = nearest point touches. number = mm past flush. Default: 'full'.
- `gap?: number` — Standoff gap in mm. Positive = gap between face and target. Negative = extra penetration. Default: 0.

#### `seatOver(target: Shape, targetSurface: string, options?: SeatIntoOptions): Shape` — Slide this shape until a target's labeled face is fully covered (inside this shape).

The inverse of `seatInto`: instead of embedding *your* face into the target, you move until the *target's* face is embedded inside you.

```js
// Nacelle moves up until pylon's bottom face is inside the nacelle
nacelle.translate(rough).seatOver(pylon, 'bottom');

// Cap slides down over a post until post's top face is covered
cap.translate(rough).seatOver(post, 'top');
```

**Connectors**

#### `withConnectors(connectors: Record<string, ConnectorInput>): Shape` — Attach named connectors — attachment points that survive transforms and imports. Connectors can be bare (position + orientation) or typed (with connectorType/gender for compatibility matching).

`PortInput`: `{ origin?: Vec3, axis?: Vec3, start?: Vec3, end?: Vec3, up?: Vec3, kind?: JointType, min?: number, max?: number }`

`ConnectorInput`: `{ connectorType?: string, gender?: ConnectorGender, measurements?: Record<string, number | string> }`

#### `connectorNames(): string[]` — List all connector names on this shape.

#### `connectorsByType(type: string): Array<{ name: string; port: ConnectorDef; }>` — Get all connectors of a given type.

#### `connectorDistance(nameA: string, nameB: string): number` — Distance between two connector origins on this shape.

#### `connectorMeasurements(name: string): Record<string, number | string>` — Get measurements metadata from a connector.

#### `matchTo(targetOrPairs: Shape | MatchTarget | Array<[ Shape | MatchTarget, string, string ]>, selfConnOrDict?: string | Record<string, string>, targetConnOrOptions?: string | MatchToOptions, maybeOptions?: MatchToOptions): Shape` — Position this shape by matching connectors to a target.

Alignment: with a single connector pair, the shape translates and rotates so the connector origins coincide and the axes oppose (plug-in model); `up` pins the roll. With multiple pairs, the connector origins define the rigid transform — still author meaningful `axis`/`up` values so the same connectors remain useful for `connect()`, audits, and future matching.

Overloads:

- Single pair: `matchTo(target, selfConn, targetConn, options?)`
- Dictionary (same target): `matchTo(target, { selfConn: targetConn, ... }, options?)`
- Multi-target: `matchTo([ [target1, selfConn1, targetConn1], ... ], options?)`

`MatchToOptions`: `{ force?: boolean, angle?: number, distance?: number }`

**References**

#### `withReferences(refs: PlacementReferenceInput): Shape` — Attach named placement references that survive normal transforms and imports.

**`PlacementReferenceInput`**: `points?: Record<string, Vec3>`, `edges?: Record<string, PlacementEdgeRef>`, `surfaces?: Record<string, PlacementSurfaceRef>`, `objects?: Record<string, PlacementObjectInput>`

`PlacementEdgeRef`: `{ start: Vec3, end: Vec3 }`

`PlacementSurfaceRef`: `{ center: Vec3, normal: Vec3 }`

#### `referenceNames(kind?: PlacementReferenceKind): string[]` — List named placement references carried by this shape.

#### `referencePoint(ref: PlacementAnchorLike): Vec3` — Resolve a named placement reference or built-in anchor to a 3D point.

**Measurement**

#### `boundingBox(): ShapeRuntimeBounds` — Get the axis-aligned bounding box as { min: [x,y,z], max: [x,y,z] }.

#### `volume(): number` — Volume in mm cubed.

#### `surfaceArea(): number` — Surface area in mm squared.

#### `isEmpty(): boolean` — True if the shape contains no geometry.

#### `numBodies(): number` — Number of disconnected solid bodies in this shape.

#### `numTri(): number` — Triangle count of the mesh representation.

**Other**

#### `clone(): Shape` — Return a new Shape wrapper for explicit duplication in scripts.

#### `geometryInfo(): GeometryInfo` — Inspect which backend/representation produced this solid.

#### `as(name: string): Shape` — Name this shape as a reference namespace for diagnostics and future published refs.

#### `ref(path: string): ShapeRef` — Resolve a semantic reference path like `lid`, `lid/back`, or a midpoint selector on `lid/back`.

#### `thicken(thickness: number): Shape` — Offset-thicken an exact open surface or shell into a solid.

#### `getMesh(): ShapeRuntimeMesh` — Extract triangle mesh for Three.js rendering

#### `slice(offset?: number): any` — Slice the runtime solid by a plane normal to local Z at the given offset.

#### `project(): any` — Orthographically project the runtime solid onto the local XY plane.

**Compatibility Aliases**

- `withPorts()` -> `withConnectors()`
- `portNames()` -> `connectorNames()`

### `Transform`

#### `static identity(): Transform` — Return the identity transform.

#### `static from(input: TransformInput): Transform` — Wrap an existing `Transform` or raw 4x4 matrix as a `Transform`.

#### `static compose(...steps: TransformInput[]): Transform` — Compose transforms in chain order: `Transform.compose(a, b, c)` applies `a`, then `b`, then `c` — the same left-to-right order as `Transform.from(a).mul(b).mul(c)`.

Prefer this over manual `.mul()` chains when composing 3+ transforms (e.g. kinematics: `local -> childBase -> jointMotion -> jointFrame -> parentWorld`); the variadic form makes the application order explicit and prevents order mistakes.

```ts
const world = Transform.compose(childBase, jointMotion, jointFrame, parentWorld);
```

#### `static translation(x: number, y: number, z: number): Transform` — Create a translation transform.

#### `static scale(v: number | Vec3): Transform` — Create a uniform or per-axis scale transform.

#### `static rotationAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform` — Create a rotation around an arbitrary axis, optionally about a pivot.

#### `static rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: Vec3, targetPoint: Vec3, options?: RotateAroundToOptions): Transform` — Solve the rotation needed to move one point onto a target line or plane.

#### `mul(other: TransformInput): Transform` — Compose transforms in chain order: `a.mul(b)` applies `a`, then `b`.

#### `translate(x: number, y: number, z: number): Transform` — Translate after the current transform.

#### `rotateAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform` — Rotate after the current transform.

#### `rotateX(angleDeg: number, pivot?: Vec3): Transform` — Rotate about the X axis after the current transform (parity with `Shape.rotateX`).

#### `rotateY(angleDeg: number, pivot?: Vec3): Transform` — Rotate about the Y axis after the current transform (parity with `Shape.rotateY`).

#### `rotateZ(angleDeg: number, pivot?: Vec3): Transform` — Rotate about the Z axis after the current transform (parity with `Shape.rotateZ`).

#### `inverse(): Transform` — Return the inverse transform.

#### `point(p: Vec3): Vec3` — Transform a point using homogeneous coordinates.

#### `vector(v: Vec3): Vec3` — Transform a direction vector without translation.

#### `toArray(): Mat4` — Return the transform as a raw 4x4 matrix array.

### `ShapeGroup`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `children` | `GroupChild[]` | — |
| `childNames` | `Array<string \| undefined>` | — |

**Children**

#### `child(name: string): GroupChild` — Return the named child by name. Throws if not found. Useful when importing a multipart group and working on components individually.

#### `childName(index: number): string | undefined` — Return the optional name of the child at `index`.

**Transforms**

#### `translate(x: number, y: number, z: number): ShapeGroup` — Move the entire group by (x, y, z). All children move together as a unit.

#### `moveTo(x: number, y: number, z: number): ShapeGroup` — Move the group so its bounding-box min corner lands at the given coordinate.

#### `moveToLocal(target: Shape | ShapeGroup, x: number, y: number, z: number): ShapeGroup` — Move the group relative to another part's bounding-box min corner.

#### `rotate(axis: Vec3, angleDeg: number, options?: { pivot?: Vec3; }): ShapeGroup` — Rotate the group around an arbitrary axis through the origin. Unlike `scale()`/`mirror()` (bounding-box center) and `Sketch.rotate()`, this pivots at the world origin — pass `options.pivot` to rotate in place.

#### `rotateX(angleDeg: number, options?: { pivot?: Vec3; }): ShapeGroup` — Rotate the group around the X axis.

#### `rotateY(angleDeg: number, options?: { pivot?: Vec3; }): ShapeGroup` — Rotate the group around the Y axis.

#### `rotateZ(angleDeg: number, options?: { pivot?: Vec3; }): ShapeGroup` — Rotate the group around the Z axis.

#### `rotateAroundAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): ShapeGroup` — Rotate around an arbitrary axis, optionally through a pivot point.

#### `rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: Anchor3D | Vec3, targetPoint: Anchor3D | Vec3, options?: RotateAroundToOptions): ShapeGroup` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. ShapeGroup string points use built-in anchors only.

#### `pointAlong(direction: Vec3): ShapeGroup` — Reorient the group so its local Z axis points along `direction`.

#### `transform(m: Mat4 | Transform): ShapeGroup` — Apply a 4x4 transform matrix or `Transform` to all 3D children.

#### `scale(v: number | Vec3): ShapeGroup` — Scale uniformly or per-axis from the group's bounding-box center.

#### `scaleAround(pivot: Vec3, v: number | Vec3): ShapeGroup` — Scale uniformly or per-axis from an explicit pivot point.

#### `mirror(normal: Vec3): ShapeGroup` — Mirror across a plane through the group's bounding-box center.

#### `mirrorThrough(point: Vec3, normal: Vec3): ShapeGroup` — Mirror across a plane through an explicit point.

**Placement**

#### `placeReference(ref: PlacementAnchorLike, target: Vec3, offset?: Vec3): ShapeGroup` — Translate the group so the given anchor or reference lands on the target coordinate.

Accepts any built-in anchor name (`'bottom'`, `'center'`, `'top-front-left'`, etc.) or a custom placement reference attached via `withReferences()`.

```javascript
// Ground a group — put its bottom at Z = 0
assembly.placeReference('bottom', [0, 0, 0])

// Use a custom reference from a multi-file part
const placed = require('./bracket-assembly.forge.js').group
  .placeReference('mountCenter', [0, 0, 50]);
```

#### `attachTo(target: Shape | ShapeGroup, targetAnchor: Anchor3D | string, selfAnchor?: Anchor3D, offset?: Vec3): ShapeGroup` — Attach this group to a face or anchor on another part.

`targetAnchor` can be a built-in anchor name or a custom reference name on the target. `selfAnchor` selects the anchor on this group to align.

#### `onFace(parent: Shape | ShapeGroup, face: "front" | "back" | "left" | "right" | "top" | "bottom", opts?: { u?: number; v?: number; protrude?: number; }): ShapeGroup` — Place this group on a face of a parent shape. See Shape.onFace() for full documentation.

**Connectors**

#### `withConnectors(connectors: Record<string, ConnectorInput>): ShapeGroup` — Attach named connectors — attachment points that survive transforms. Connectors can be bare (position + orientation) or typed (with connectorType/gender for compatibility matching).

#### `connectorNames(): string[]` — List all connector names, including "ChildName.connectorName" from named children.

#### `connectorsByType(type: string): Array<{ name: string; port: ConnectorDef; }>` — Get all connectors of a given type, including from named children.

#### `connectorDistance(nameA: string, nameB: string): number` — Distance between two connector origins on this group (supports dotted child paths).

#### `connectorMeasurements(name: string): Record<string, number | string>` — Get measurements metadata from a connector (supports dotted child paths).

#### `matchTo(targetOrPairs: Shape | ShapeGroup | Array<[ Shape | ShapeGroup, string, string ]>, selfConnOrDict?: string | Record<string, string>, targetConnOrOptions?: string | MatchToOptions, maybeOptions?: MatchToOptions): ShapeGroup` — Position this group by matching connectors to a target. Connector names support dotted paths into named children: "ChildName.connectorName".

Alignment: with a single connector pair, the group translates and rotates so the connector origins coincide and the axes oppose (plug-in model); `up` pins the roll. With multiple pairs, the connector origins define the rigid transform — still author meaningful `axis`/`up` values so the same connectors remain useful for `connect()`, audits, and future matching.

Overloads:

- Single pair: `matchTo(target, selfConn, targetConn, options?)`
- Dictionary (same target): `matchTo(target, { selfConn: targetConn, ... }, options?)`
- Multi-target: `matchTo([ [target1, selfConn1, targetConn1], ... ], options?)`

**References**

#### `withReferences(refs: PlacementReferenceInput): ShapeGroup` — Attach named placement references to this group. References survive normal transforms (translate/rotate/scale/mirror/transform).

```javascript
const bracket = group(
  { name: 'Left', shape: leftShape },
  { name: 'Right', shape: rightShape },
).withReferences({
  points: { mountCenter: [0, 0, 0] },
});
```

#### `referenceNames(kind?: PlacementReferenceKind): string[]` — List named placement references carried by this group.

#### `referencePoint(ref: PlacementAnchorLike): Vec3` — Resolve a named placement reference or built-in Anchor3D to a 3D point. Named refs take priority over built-in anchors.

**Other**

#### `clone(): ShapeGroup` — Return a deep-cloned ShapeGroup tree (refs copied).

#### `boundingBox(): { min: Vec3; max: Vec3; }` — Return the combined 3D bounding box of all children.

#### `color(hex: string): ShapeGroup` — Return a copy of the group with the given display color applied to each child.

**Compatibility Aliases**

- `withPorts()` -> `withConnectors()`
- `portNames()` -> `connectorNames()`

### `SurfacePattern`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `body` | `string` | Function body: receives (u, v) in surface mm, returns height displacement. |
| `constants` | `Record<string, number>` | Named constants injected into the function. |

### `Pattern2D`

#### `add(...patterns: Pattern2DInput[]): Pattern2D` — Add this pattern to one or more patterns or constant height offsets.

#### `subtract(pattern: Pattern2DInput): Pattern2D` — Subtract another pattern or constant height offset from this pattern.

#### `multiply(...patterns: Pattern2DInput[]): Pattern2D` — Multiply this pattern by one or more patterns or numeric scale factors.

#### `min(...patterns: Pattern2DInput[]): Pattern2D` — Keep the lower height between this pattern and one or more other patterns.

#### `max(...patterns: Pattern2DInput[]): Pattern2D` — Keep the higher height between this pattern and one or more other patterns.

#### `clamp(min: number, max: number): Pattern2D` — Limit pattern height to the inclusive `[min, max]` range in millimeters.

#### `abs(): Pattern2D` — Convert negative heights to positive heights.

#### `negate(): Pattern2D` — Flip the pattern height sign.

### `Pattern2DBuilder`

#### `constant(value?: number): Pattern2D` — Create a constant-height pattern in millimeters.

#### `sineWave(options: Pattern2DSineWaveOptions): Pattern2D` — Create a sinusoidal wave pattern in UV space.

**`Pattern2DSineWaveOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `direction?` | `Vec2` | Direction the wave advances in UV space. Default: [1, 0]. |
| `wavelength` | `number` | Distance between wave peaks in surface millimeters. |
| `amplitude?` | `number` | Height amplitude in millimeters. Default: 1. |
| `phase?` | `number` | Phase offset in radians. Default: 0. |
| `bias?` | `number` | Constant height offset in millimeters. Default: 0. |

#### `stripes(options: Pattern2DStripesOptions): Pattern2D` — Create recessed stripe bands in UV space.

**`Pattern2DStripesOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `direction?` | `Vec2` | Direction perpendicular to the stripe bands in UV space. Default: [1, 0]. |
| `spacing` | `number` | Center-to-center spacing in surface millimeters. |
| `width` | `number` | Stripe width in surface millimeters. |
| `depth?` | `number` | Stripe groove depth in millimeters. Default: 1. |

#### `overUnderWeave(options: Pattern2DOverUnderWeaveOptions): Pattern2D` — Create an over-under woven relief pattern in UV space.

**`Pattern2DOverUnderWeaveOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `spacing` | `number \| Vec2` | Thread center-to-center spacing. A number uses the same spacing for U and V. |
| `threadWidth` | `number \| Vec2` | Thread width. A number uses the same width for U and V. |
| `depth?` | `number` | Thread groove depth in millimeters. Default: 0.8. |
| `underScale?` | `number` | Relative height of the under-crossing thread. Default: 0.15. |

### `ShapeRef`

A first-class reference path over a shape's semantic faces and face relationships.

Created with `shape.ref("lid/back")`, then refined through methods such as `.point()` or `.edges()`. The reference stores intent as a readable path and resolves lazily against the current shape metadata.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | — |

**Methods:**

#### `resolve(): ShapeReferenceResolution` — Resolve this reference into its current faces, edges, or points.

#### `get kind(): ShapeReferenceKind` — The resolved reference kind, such as `face`, `edge-set`, or `point`.

#### `get cardinality(): ShapeReferenceCardinality` — Whether the reference currently resolves to zero, one, or many matches.

#### `status(): ShapeReferenceStatus` — Return the reference lifecycle status for the current shape state.

#### `explain(): string` — Return a human-readable explanation of how this reference resolved.

#### `as(name: string): ShapeRef` — Name this derived reference so the same shape can resolve it by `shape.ref(name)`.

#### `maybe(): ShapeRef` — Return an optional reference that resolves to zero matches instead of throwing when missing.

#### `all(): ShapeRef` — Mark that a multi-match reference is intentionally being used as a set.

#### `one(): ShapeRef` — Require this reference to resolve to exactly one match.

#### `faces(): FaceRef[]` — Resolve this reference as one or more faces.

#### `face(): FaceRef` — Resolve this reference as exactly one face.

#### `edges(): EdgeSegment[]` — Resolve this reference as one or more edges. Face references return boundary edges.

#### `edge(): EdgeSegment` — Resolve this reference as exactly one edge.

#### `points(): Vec3[]` — Resolve this reference as one or more points. Faces use centers and edges use midpoints.

#### `point(): Vec3` — Resolve this reference as exactly one point.

#### `toJSON(): ShapeReferenceResolution` — Return the structured JSON-friendly reference resolution.

#### `toString(): string` — Return a compact display form for this reference path.

---

## Constants

### `ANCHOR3D_NAMES`

### `verify`

Members (full entries under [Verification](#verification)): `verify.that`, `verify.equal`, `verify.notEqual`, `verify.greaterThan`, `verify.lessThan`, `verify.inRange`, `verify.centersCoincide`, `verify.connectorDistance`, `verify.physicalComponentCount`, `verify.intentionalOverlap`, `verify.notColliding`, `verify.minClearance`, `verify.clearanceBetween`, `verify.parallel`, `verify.perpendicular`, `verify.coplanar`, `verify.faceAt`, `verify.sameDirection`, `verify.isEmpty`, `verify.notEmpty`, `verify.volumeApprox`, `verify.areaApprox`, `verify.boundingBoxSize`, `verify.edgeContinuity`, `verify.noTinyEdges`, `verify.noSliverFaces`, `verify.noSelfIntersection`.

### `Points`

- `distance(a: Vec3, b: Vec3): number` — Euclidean distance between two 3D points.
- `midpoint(a: Vec3, b: Vec3): Vec3` — Center point between two 3D points.
- `lerp(a: Vec3, b: Vec3, t: number): Vec3` — Linearly interpolate between two 3D points. t=0 returns a, t=1 returns b.
- `direction(a: Vec3, b: Vec3): Vec3` — Unit direction vector from a to b. Throws if a and b are the same point.
- `offset(point: Vec3, dir: Vec3, amount: number): Vec3` — Move a point along a direction vector by a given amount.
- `polar(length: number, angleDeg: number, from?: Vec2): Vec2` — Compute a 2D point at distance and angle (degrees) from an optional origin.

### `connector`

Connector factory. Create attachment points: `connector({...})`, `connector.male(type, {...})`, etc.

### `Import`

Namespaced file-format import helpers — the single vocabulary for bringing external geometry files into a model.

- `dxfSketch(fileName: string, options?: DxfImportOptions): Sketch` — Parse a DXF file and return closed 2D profile geometry as a Sketch. The result can be extruded directly.
- `svgSketch(fileName: string, options?: SvgImportOptions): Sketch` — Parse an SVG file and return it as a Sketch with options for region filtering, scaling, and simplification.
- `mesh(fileName: string, options?: { scale?: number; center?: boolean; object?: string; separateObjects?: boolean; }): Shape | ShapeGroup` — Import an external mesh file (STL, OBJ, 3MF).

  By default, 3MF build items are flattened into one Shape for compatibility. Use `separateObjects: true` to import 3MF build items/resource objects as a named ShapeGroup whose children are targetable by `forgecad ls`. Use `object` to import one item by the stable ref/name reported by `forgecad run`.

  For 3MF sources, `forgecad run` prints a source-structure table with one line per build item: `[3mf:build:NNN:object:N] name type=... verts=... tris=... bbox=[min] → [max]`. Build items are numbered from `001`; files with no build items list resource objects as `3mf:object:N` instead. Per-item bboxes reveal multi-part structure — account for every substantial item before flattening. Pass any listed stable ref or name as `object` to import that item alone.

  ```js
  const all = Import.mesh("./assembly.3mf", { separateObjects: true });
  const pin = all.child("Pin #001");
  const plate = Import.mesh("./assembly.3mf", { object: "3mf:build:001:object:7" });
  ```
- `step(fileName: string): Shape` — Import a STEP file (.step, .stp) as an exact OCCT-backed Shape. Preserves NURBS curves, B-spline surfaces, and exact topology. Requires running with the OCCT backend.

---
skill-group: sketch
skill-order: 100
---

# Sketch API

2D geometry creation, transforms, booleans, constrained sketches, and extrusion.

## Contents

- [2D Sketch Primitives](#2d-sketch-primitives) — `path`, `stroke`, `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `arcSlot`, `star`
- [2D Sketch Booleans](#2d-sketch-booleans) — `union2d`, `difference2d`, `intersection2d`
- [2D Sketch Features](#2d-sketch-features) — `filletCorners`
- [Tracked Solid Edge Features](#tracked-solid-edge-features) — `filletTrackedEdge`, `chamferTrackedEdge`
- [2D Text](#2d-text) — `loadFont`, `text2d`, `textWidth`
- [Constrained Sketches](#constrained-sketches) — `constrainedSketch`, `addRect`, `addPolygon`, `addRegularPolygon`
- [2D Geometry Helpers](#2d-geometry-helpers) — `point`, `line`, `circle`, `degrees`, `radians`
- [Sketch](#sketch) — Transforms, Booleans, Features, Promotion, Placement, Labels, Measurement
- [ConstrainedSketchBuilder](#constrainedsketchbuilder) — Drawing, Entities, Geometric Constraints, Dimensional Constraints, Coincidence & Equality, Tangent Transitions, Shape Constraints, Positioning, Solving
- [ConstraintSketch](#constraintsketch)
- [SketchGroupBuilder](#sketchgroupbuilder)
- [Point2D](#point2d)
- [Line2D](#line2d)
- [Circle2D](#circle2d)
- [Rectangle2D](#rectangle2d)

## Functions

### 2D Sketch Primitives

#### `path()` — Create a new [`PathBuilder`](/docs/curves#pathbuilder) for tracing a 2D outline point by point.

[`PathBuilder`](/docs/curves#pathbuilder) is a fluent API for constructing 2D profiles using a mix of line segments, arcs, bezier curves, and splines. Always start with `.moveTo(x, y)` to set the starting point. Call `.close()` to get a filled `Sketch`, or `.stroke(width)` to thicken an open polyline into a solid profile.

Edge labels can be assigned with `.label('name')` after any segment — they propagate through extrusion, revolve, loft, and sweep into named faces on the resulting [`Shape`](/docs/core#shape).

```ts
// Closed triangle
const triangle = path().moveTo(0, 0).lineH(50).lineV(30).close();

// L-shaped bracket as a stroke
const bracket = path().moveTo(0, 0).lineH(50).lineV(-70).lineAngled(20, 235).stroke(4);

// Labeled edges for downstream face references
const slot = path()
  .moveTo(0, 0)
  .lineTo(30, 0).label('bottom')
  .lineTo(30, 10)
  .lineTo(0, 10).label('top')
  .close();
```

```ts
path(): PathBuilder
```

#### `stroke()` — Create a stroked polyline sketch from an array of 2D points.

```ts
stroke(points: [ number, number ][], width: number, join?: "Round" | "Square"): Sketch
```

#### `rect()` — Create a 2D rectangle centered at the origin.

```ts
rect(40, 20).extrude(5);
```

```ts
rect(width: number, height: number): Sketch
```

#### `circle2d()` — Create a 2D circle centered at the origin.

Omit `segments` for a smooth (auto-tessellated) circle. Pass an integer to get a regular polygon approximation — e.g. `6` for a hexagon, `8` for an octagon.

```ts
circle2d(25).extrude(10);          // smooth cylinder
circle2d(25, 6).extrude(10);       // hexagonal prism
```

```ts
circle2d(radius: number, segments?: number): Sketch
```

#### `roundedRect()` — Create a 2D rectangle with rounded corners, centered at the origin.

The corner radius is automatically clamped to `min(width/2, height/2)` so it can never exceed the shape dimensions.

```ts
roundedRect(60, 30, 5).extrude(3);
```

```ts
roundedRect(width: number, height: number, radius: number): Sketch
```

#### `polygon()` — Create a 2D polygon from an array of `[x, y]` points or `Point2D` objects.

Winding order is normalized automatically — clockwise (CW) input is silently reversed to CCW before being passed to the geometry kernel.

```ts
polygon([[0, 0], [50, 0], [25, 40]]).extrude(5); // triangle
```

```ts
polygon(points: ([ number, number ] | Point2D)[]): Sketch
```

#### `ngon()` — Create a regular polygon inscribed in a circle of the given radius.

`radius` is the center-to-vertex (circumradius) distance. Use `sides` of `3` for a triangle, `6` for a hexagon, etc. The first vertex is at the top (−90° from +X).

```ts
ngon(6, 20).extrude(10); // hexagonal prism, circumradius 20
```

```ts
ngon(sides: number, radius: number): Sketch
```

#### `ellipse()` — Create a 2D ellipse centered at the origin.

```ts
ellipse(30, 15).extrude(5);
ellipse(30, 15, 32).extrude(5); // lower-resolution approximation
```

```ts
ellipse(rx: number, ry: number, segments?: number): Sketch
```

#### `slot()` — Create a slot (oblong / stadium shape) — a rectangle with semicircular ends, centered at the origin.

```ts
slot(40, 10).extrude(3); // 40mm long, 10mm wide slot
```

```ts
slot(length: number, width: number): Sketch
```

#### `arcSlot()` — Create an arc-shaped slot (banana / annular sector) centered at the origin.

The slot is symmetric about the +X axis. The two ends are closed with semicircular caps. `pitchRadius` is the distance from the origin to the centerline of the slot, and `thickness` is the radial width of the slot.

```ts
arcSlot(135, 74, 40).extrude(5); // pitch R135, 74° sweep, 40mm wide
```

```ts
arcSlot(pitchRadius: number, sweepDeg: number, thickness: number): Sketch
```

#### `star()` — Create a star shape with alternating outer and inner radii.

```ts
star(5, 30, 12).extrude(4); // five-pointed star
```

```ts
star(points: number, outerR: number, innerR: number): Sketch
```

### 2D Sketch Booleans

#### `union2d()` — Combine 2D sketches into a single profile using an additive boolean union.

Accepts individual sketches or arrays: `union2d(a, b, c)` or `union2d([a, b, c])`. Uses Manifold's batch operation — faster than chaining `.add()` one by one when combining many sketches.

```ts
const cross = union2d(rect(60, 10), rect(10, 60));
```

```ts
union2d(...inputs: SketchOperandInput[]): Sketch
```

#### `difference2d()` — Subtract one or more 2D sketches from a base sketch.

The first sketch is the base; all subsequent sketches are subtracted from it. Accepts individual sketches or arrays: `difference2d(base, c1, c2)` or `difference2d([base, c1, c2])`. Uses Manifold's batch operation — faster than chaining `.subtract()` one by one.

```ts
const donut = difference2d(circle2d(50), circle2d(30));
```

```ts
difference2d(...inputs: SketchOperandInput[]): Sketch
```

#### `intersection2d()` — Keep only the area where all input sketches overlap (intersection boolean).

Accepts individual sketches or arrays: `intersection2d(a, b)` or `intersection2d([a, b, c])`. Uses Manifold's batch operation — faster than chaining `.intersect()` one by one.

```ts
const lens = intersection2d(circle2d(30).translate(-10, 0), circle2d(30).translate(10, 0));
```

```ts
intersection2d(...inputs: SketchOperandInput[]): Sketch
```

### 2D Sketch Features

#### `filletCorners()` — Create a polygon from points with specific corners rounded to arc fillets.

Each corner spec identifies a vertex by its index in the `points` array and the desired fillet `radius`. Both convex and concave corners are supported.

Constraints:

- Collinear corners cannot be filleted (throws an error)
- Two neighboring fillets whose tangent lengths overlap the same edge will throw
- Radius must be positive and small enough to fit within the adjacent edge lengths

Use `offset(-r).offset(+r)` instead if you want to round **all** convex corners uniformly. Use `filletCorners` when you need selective or mixed sharp/rounded profiles.

```ts
const roof = filletCorners(roofPoints, [
  { index: 3, radius: 19 },
  { index: 4, radius: 19 },
  { index: 5, radius: 19 },
]);
```

```ts
filletCorners(points: PointInput[], corners: FilletCornerSpec[]): Sketch
```

`FilletCornerSpec`: `{ index: number, radius: number, segments?: number }`

### Tracked Solid Edge Features

#### `filletTrackedEdge()` — Round a tracked vertical solid edge with a circular fillet.

Compiler-owned fillet for a narrow tracked-edge subset on solids.

This is **not** a general 2D sketch-corner fillet. It currently works only on tracked vertical edges from [`box()`](/docs/core#box) or `Rectangle2D` extrusions (plus rigid transforms and supported preserved descendants of those). Generic sketch extrudes, including `rect(...).extrude(...)`, are outside the supported subset right now.

**Supported edges:**

- Tracked vertical edges from [`box()`](/docs/core#box) or `Rectangle2D.extrude()`
- Rigid transforms between tracked source and target
- Untouched sibling tracked vertical edges after earlier `filletTrackedEdge`/`chamferTrackedEdge`

**Not supported:** edges after shell, hole, cut, trim, difference, intersection, generic sketch extrudes, or tapered extrudes.

Canonical quadrants: `vert-bl → [1,-1]`, `vert-br → [-1,-1]`, `vert-tr → [-1,1]`, `vert-tl → [1,1]`

```ts
const base = Rectangle2D.fromDimensions(0, 0, 50, 50).extrude(20);
const filleted = filletTrackedEdge(base, base.edge('vert-br'), 5, [-1, -1]);
```

```ts
filletTrackedEdge(shape: Shape, edge: EdgeRef, radius: number, quadrant?: [ number, number ], segments?: number): Shape
```

**`EdgeRef`**

| Option | Type | Description |
|--------|------|-------------|
| `start` | `[ number, number, number ]` | Start point |
| `end` | `[ number, number, number ]` | End point |
| `query?` | `EdgeQueryRef` | Compiler-owned edge query when available. |
| `curve?` | `EdgeCurve` | Exact or parametric curve family when the backend/source can identify one. |
| `faceName?` | `string` | Owning face name when the edge is associated with one face in a larger topology. |
| `name` | | — |

#### `chamferTrackedEdge()` — Bevel a tracked vertical solid edge with a 45° chamfer.

Compiler-owned chamfer for tracked vertical edges. Requires a compile-plan-covered target. This is not a general 2D sketch-corner tool; supported subset and quadrant semantics are the same as `filletTrackedEdge()` - see that function for details.

```ts
const base = Rectangle2D.fromDimensions(0, 0, 50, 50).extrude(20);
const chamfered = chamferTrackedEdge(base, base.edge('vert-br'), 3, [-1, -1]);
```

```ts
chamferTrackedEdge(shape: Shape, edge: EdgeRef, size: number, quadrant?: [ number, number ]): Shape
```

### 2D Text

#### `loadFont()` — Pre-load and cache a font for use with `text2d()`.

Fonts are cached by their source string (or `cacheKey` for `ArrayBuffer` sources), so repeated calls with the same path are free. Pre-loading is useful when you call `text2d()` many times with the same font — it avoids repeated disk reads.

Built-in font names that work everywhere (browser + CLI):

- `'sans-serif'` or `'inter'` — bundled Inter Regular

```ts
const font = loadFont('/path/to/Arial Bold.ttf');
text2d('Title', { size: 12, font }).extrude(1.5);
text2d('Subtitle', { size: 8, font }).extrude(1);
```

```ts
loadFont(source: string | ArrayBuffer, cacheKey?: string): opentype.Font
```

#### `text2d()` — Build a filled 2D Sketch from a text string.

The Sketch origin is at the left end of the text baseline by default. Use `align` and `baseline` options to adjust placement. Text is rendered using the bundled Inter font by default, or any TTF/OTF/WOFF font you provide.

`text2d()` creates real geometry. For temporary viewport annotations, prefer `Viewport.label()` so the text stays off the geometry and OCCT compile paths. Do not use either form of text to make unclear production geometry readable; model the physical artifact clearly instead.

Alignment reference table:

| `align`    | `baseline`   | Origin                              |
|------------|--------------|-------------------------------------|
| `'left'`   | `'baseline'` | Bottom-left of first char (default) |
| `'center'` | `'center'`   | Dead center of text block           |
| `'right'`  | `'top'`      | Top-right corner                    |

```ts
// Extruded nameplate
text2d('FORGE CAD', { size: 8 }).extrude(1.2);

// Centered label on the XY plane
text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' });

// Engraved text cut into the top face of a box
const label = text2d('REV A', { size: 5, align: 'center', baseline: 'center' });
plate.subtract(label.onFace(plate, 'top', { protrude: -0.5 }).extrude(1));

// Custom TTF font
text2d('Hello', { size: 10, font: '/path/to/Arial.ttf' }).extrude(1);

// Pre-loaded font for reuse
const font = loadFont('/path/to/Arial Bold.ttf');
text2d('Title', { size: 12, font }).extrude(1.5);
```

```ts
text2d(content: string, options?: TextOptions): Sketch
```

**`TextOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `size?` | `number` | Cap height of the text in model units. All other dimensions (stroke weight, spacing) scale proportionally. |
| `letterSpacing?` | `number` | Extra space between characters in model units. Negative values tighten the tracking. |
| `align?` | `"left" \| "center" \| "right"` | Horizontal alignment relative to x = 0. - `'left'` — left edge at x = 0 (default) - `'center'` — centred on x = 0 - `'right'` — right edge at x = 0 |
| `baseline?` | `"baseline" \| "center" \| "top"` | Vertical alignment relative to y = 0. - `'baseline'` — y = 0 is the text baseline (bottom of capital letters) - `'center'` — y = 0 is the vertical midpoint of the cap height - `'top'` — y = 0 is the top of capital letters |
| `font?` | `string \| opentype.Font` | Font to use for text rendering. - `'sans-serif'` or `'inter'` — bundled Inter font (works everywhere, including browser) - **file path** — path to a TTF, OTF, or WOFF font file (CLI/Node only) - **Font object** — a previously loaded opentype.js Font (from `loadFont()`) - **omitted** — uses the bundled Inter font (same as `'sans-serif'`) |
| `flattenTolerance?` | `number` | Bezier flattening tolerance in model units. Smaller = more polygon segments = smoother curves. |

#### `textWidth()` — Measure the rendered advance width of a string without creating any geometry.

Uses the same font metrics as `text2d()`. Useful for computing layout dimensions before building the actual sketch — e.g. sizing a plate to fit a label.

```ts
const w = textWidth('SERIAL: 001', { size: 6 });
const plate = box(w + 10, 12, 2);
```

```ts
textWidth(content: string, options?: Pick<TextOptions, "size" | "letterSpacing" | "font">): number
```

### Constrained Sketches

#### `constrainedSketch()` — Create a parametric 2D sketch driven by geometric constraints and a nonlinear solver.

**Workflow**

1. Create a builder with `constrainedSketch()`.
2. Add geometry — points, lines, circles, arcs — using the builder methods.
3. Add constraints (`horizontal`, `length`, `fix`, etc.) to drive the geometry.
4. Call `.solve()` to run the solver and get a `ConstraintSketch` (which extends `Sketch`).

```ts
const sk = constrainedSketch();
const p1 = sk.point(0, 0);
const p2 = sk.point(50, 0);
const l1 = sk.line(p1, p2);
sk.fix(p1, 0, 0);
sk.horizontal(l1);
sk.length(l1, 50);
return sk.solve().extrude(10);
```

**Solver status**

```ts
const result = sk.solve();
result.constraintMeta.status;   // 'fully' | 'under' | 'over' | 'over-redundant'
result.constraintMeta.dof;      // 0 = fully constrained
result.constraintMeta.maxError; // residual — should be < 1e-6
result.inspect();               // human-readable summary
result.withUpdatedConstraint('cst-5', 120); // update a dimension without rebuilding
```

```ts
constrainedSketch(options?: ConstrainedSketchOptions): ConstrainedSketchBuilder
```

**`ConstrainedSketchOptions`**
- `strict?: boolean` — When true, adding a constraint that cannot be satisfied throws instead of silently discarding it.

#### `addRect()` — Add an axis-aligned rectangle concept to the builder.

Creates 4 vertices (CCW: bl→br→tr→tl), 4 sides, 4 structural constraints (`horizontal`/`vertical` on each side), CCW winding, a center point, a loop, and a shape. Returns a `ConstrainedRect` handle with 4 DOF (x, y, width, height).

Use `sk.rect()` as the shorthand builder method.

```ts
const sk = constrainedSketch();
const r = sk.rect({ x: 0, y: 0, width: 100, height: 50 });
sk.fix(r.bottomLeft, 0, 0);
sk.length(r.bottom, 120);  // override initial width
return sk.solve().extrude(10);
```

```ts
addRect(sk: ConstrainedSketchBuilder, options?: RectOptions): ConstrainedRect
```

**`RectOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `x?` | `number` | Bottom-left x coordinate. Default: 0. |
| `y?` | `number` | Bottom-left y coordinate. Default: 0. |
| `width?` | `number` | Width (along x). Default: 10. |
| `height?` | `number` | Height (along y). Default: 10. |
| `blockRotation?` | `boolean` | Prevent 180° rotation (ensures bottom edge points rightward). Default: false. |

**`ConstrainedRect`**

| Option | Type | Description |
|--------|------|-------------|
| `bottom` | `LineId` | bottom-left → bottom-right |
| `right` | `LineId` | bottom-right → top-right |
| `top` | `LineId` | top-right → top-left |
| `left` | `LineId` | top-left → bottom-left |
| `center` | `PointId` | Center point constrained to the geometric center via `midpoint` on the diagonal. Can be used in further constraints: `sk.fix(rect.center, 0, 0)`, `sk.coincident(rect.center, other)`. |
| `shape` | `ShapeId` | ShapeId for `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y`. |
| `vertices` | `[ PointId, PointId, PointId, PointId ]` | CCW-ordered vertex array: [bottomLeft, bottomRight, topRight, topLeft]. |
| `sides` | `[ LineId, LineId, LineId, LineId ]` | CCW-ordered side array: [bottom, right, top, left]. |
| `bottomLeft`, `bottomRight`, `topRight`, `topLeft` | | — |

#### `addPolygon()` — Add a general polygon concept to the builder.

Creates n vertices and n sides (CCW: `sides[i]` from `vertices[i]` → `vertices[(i+1) % n]`). Applies a `ccw` constraint to enforce winding. All dimensional constraints (lengths, angles, position) are left to the caller.

Use `sk.addPolygon()` as the shorthand builder method.

```ts
const sk = constrainedSketch();
const tri = sk.addPolygon({ points: [[0,0],[100,0],[50,80]] });
sk.fix(tri.vertex(0), 0, 0);
sk.length(tri.side(0), 100);
return sk.solve().extrude(5);
```

```ts
addPolygon(sk: ConstrainedSketchBuilder, options: PolygonOptions): ConstrainedPolygon
```

**`PolygonOptions`**
- `points: ReadonlyArray<readonly [ number, number ]>` — Initial vertex coordinates. Minimum 3 points.
- `addLoop?: boolean` — Whether to register a closed loop for sketch generation. Default: true.
- `blockRotation?: boolean` — Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false.

**`ConstrainedPolygon`**
- `vertices: PointId[]` — CCW-ordered PointIds.
- `sides: LineId[]` — CCW-ordered LineIds. `sides[i]` runs from `vertices[i]` → `vertices[(i+1) % n]`.
- `shape: ShapeId` — ShapeId for `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y`.

#### `addRegularPolygon()` — Add a regular n-gon concept to the builder.

Vertices are placed at `(cx + r·cos(startAngle + i·2π/n), cy + r·sin(...))`. Equal-radius and equal-side constraints enforce regularity (4 DOF: center x/y, radius, rotation). The center point is tracked by the solver and exposed via the returned handle.

Use `sk.regularPolygon()` as the shorthand builder method.

```ts
const sk = constrainedSketch();
const hex = sk.regularPolygon({ sides: 6, radius: 25 });
sk.fix(hex.center, 0, 0);
sk.length(hex.side(0), 30);  // all sides change (equal constraint)
return sk.solve().extrude(5);
```

```ts
addRegularPolygon(sk: ConstrainedSketchBuilder, options: RegularPolygonOptions): ConstrainedRegularPolygon
```

**`RegularPolygonOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `sides` | `number` | Number of sides (minimum 3). |
| `radius?` | `number` | Circumradius — distance from center to vertex. Default: 10. |
| `cx?` | `number` | Center x coordinate. Default: 0. |
| `cy?` | `number` | Center y coordinate. Default: 0. |
| `startAngle?` | `number` | Angle (in degrees) of vertex[0] measured from the +X axis (CCW positive). Default: 0 (rightmost vertex). |
| `blockRotation?` | `boolean` | Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false. |


**`ConstrainedRegularPolygon`** extends ConstrainedPolygon
- `center: PointId` — Center point. Use `sk.fix(poly.center, x, y)` to pin location, or `sk.coincident(poly.center, other)` to align with other geometry.

### 2D Geometry Helpers

#### `point()` — Create an analytic 2D point for measurement and construction geometry.

```ts
const p = point(10, 20);
p.distanceTo(point(30, 40));  // Euclidean distance
p.midpointTo(point(30, 40)); // midpoint
p.translate(5, 5);           // new shifted point
p.toTuple();                 // [10, 20]
```

```ts
point(x: number, y: number): Point2D
```

#### `line()` — Create an analytic 2D line segment between two points.

```ts
const l = line(0, 0, 50, 0);
l.length; l.midpoint; l.angle; l.direction;
l.parallel(10);          // parallel line offset 10 (positive = left)
l.intersect(l2);         // Point2D — treats lines as infinite
l.intersectSegment(l2);  // Point2D or null — segments only

Line2D.fromPointAndAngle(point(0, 0), 45, 100);
Line2D.fromPointAndDirection(point(0, 0), [1, 1], 50);
```

```ts
line(x1: number, y1: number, x2: number, y2: number): Line2D
```

#### `circle()` — Create an analytic 2D circle for measurement, construction, and extrusion.

```ts
const c = circle(0, 0, 25);
c.diameter; c.circumference; c.area;
c.pointAtAngle(90);  // Point2D at top (90° CCW from +X)

// Extrude to cylinder with named faces
const cyl = c.extrude(30);
cyl.face('top');   // FaceRef (planar)
cyl.face('side');  // FaceRef (curved)

Circle2D.fromDiameter(point(0, 0), 50);
```

```ts
circle(cx: number, cy: number, radius: number): Circle2D
```

#### `degrees()` — Identity function that returns degrees unchanged.

Use for clarity when the unit of an angle value would otherwise be ambiguous — e.g. `param("Angle", degrees(45))`.

```ts
degrees(deg: number): number
```

#### `radians()` — Convert radians to degrees.

ForgeCAD's public API uses degrees throughout. Use this when you have a radian value (e.g. from `Math.atan2`) that you want to express in degrees.

```ts
radians(rad: number): number
```

---

## Classes

### `Sketch`

Immutable 2D profile for extrusion, revolve, and other operations.

`Sketch` wraps Manifold's `CrossSection` with a chainable 2D API. Every method returns a new `Sketch` — the original is never mutated. Colors, edge labels, and placement data are preserved through all transforms and boolean operations.

Supported operations:

- **Transforms** — `translate`, `rotate`, `rotateAround`, `scale`, `mirror`
- **Booleans** — `add` (union), `subtract` (difference), `intersect`
- **Operations** — `offset`, `simplify`
- **Queries** — `area`, `bounds`, `isEmpty`, `numVert`
- **3D operations** — `extrude`, `revolve`, `onFace`
- **Regions** — `regions`, `region`
- **Placement** — `attachTo`

Named anchor positions used by `attachTo()`: `'center'` | `'top-left'` | `'top-right'` | `'bottom-left'` | `'bottom-right'` | `'top'` | `'bottom'` | `'left'` | `'right'`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `cross` | `ProfileBackend` | — |

**Transforms**

#### `translate()` — Move the sketch by the given X and Y offset.

```ts
translate(x: number, y?: number): Sketch
```

#### `rotate()` — Rotate the sketch around its bounding-box center.

```ts
rotate(degrees: number): Sketch
```

#### `rotateAround()` — Rotate the sketch around a specific pivot point.

```ts
rect(20, 20).rotateAround(45, [0, 0]);
```

```ts
rotateAround(degrees: number, pivot: [ number, number ]): Sketch
```

#### `scale()` — Scale the sketch relative to its bounding-box center.

Pass a single number for uniform scaling, or `[sx, sy]` for per-axis scaling.

```ts
scale(v: number | [ number, number ]): Sketch
```

#### `scaleAround()` — Scale the sketch relative to an arbitrary pivot point.

```ts
scaleAround(pivot: [ number, number ], v: number | [ number, number ]): Sketch
```

#### `mirror()` — Mirror the sketch across a line through its bounding-box center.

`normal` is the normal vector of the mirror line (not the line direction). For example, `[1, 0]` mirrors across a vertical line (Y axis direction), and `[0, 1]` mirrors across a horizontal line.

```ts
mirror(normal: [ number, number ]): Sketch
```

#### `mirrorThrough()` — Mirror the sketch across a line defined by a point and a normal direction.

```ts
mirrorThrough(point: [ number, number ], normal: [ number, number ]): Sketch
```

**Booleans**

#### `add()` — Add (union) one or more sketches to this sketch.

Accepts individual sketches or arrays: `sketch.add(a, b)` or `sketch.add([a, b])`. For combining many sketches at once, prefer the free function `union2d()` which uses Manifold's batch operation and is faster than chaining.

```ts
circle2d(20).add(rect(10, 30)).extrude(5);
```

```ts
add(...others: SketchOperandInput[]): Sketch
```

#### `subtract()` — Subtract one or more sketches from this sketch.

Accepts individual sketches or arrays: `sketch.subtract(a, b)` or `sketch.subtract([a, b])`. For subtracting many cutters at once, prefer the free function `difference2d()`.

```ts
rect(40, 40).subtract(circle2d(10)).extrude(5);
```

```ts
subtract(...others: SketchOperandInput[]): Sketch
```

#### `intersect()` — Intersect this sketch with one or more others (keep overlapping area only).

Accepts individual sketches or arrays: `sketch.intersect(a, b)` or `sketch.intersect([a, b])`. For intersecting many sketches, prefer the free function `intersection2d()`.

```ts
intersect(...others: SketchOperandInput[]): Sketch
```

**Features**

#### `offset()` — Inflate (positive delta) or deflate (negative delta) the sketch contour.

Use `offset(-r).offset(+r)` to round every convex corner of a closed sketch.

- `'Round'` — smooth arc at each corner (default)
- `'Square'` — flat mitered extension
- `'Miter'` — sharp pointed extension

```ts
rect(40, 20).offset(3);            // expand by 3
rect(40, 20).offset(-2).offset(2); // round all convex corners
```

```ts
offset(delta: number, join?: "Square" | "Round" | "Miter"): Sketch
```

#### `regions()` — Decompose this sketch into its distinct filled regions, sorted largest-first by area.

A single sketch can contain several disconnected filled areas (e.g., two separate rectangles, or a ring shape with a hole). This method enumerates all top-level connected regions as independent `Sketch` objects, each with its own outer boundary and associated holes.

```ts
const pair = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
const [left, right] = pair.regions(); // largest first
left.extrude(5);
```

```ts
regions(): Sketch[]
```

#### `region()` — Select the single filled region that contains the given 2D seed point.

The seed must lie strictly inside the filled area — not on a boundary edge and not inside a hole. Throws a descriptive error if the seed is outside all regions. If unsure where regions are, use `.regions()` first — each result has `.bounds()`.

```ts
const donut = circle2d(50).subtract(circle2d(30));
donut.region([40, 0]).extrude(10); // seed at radius 40, inside the ring
```

```ts
region(seed: [ number, number ]): Sketch
```

**Promotion**

#### `extrude()` — Extrude this 2D sketch along Z to create a 3D solid. Supports twist and scale tapering.

```ts
extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [ number, number ]; }): Shape
```

#### `revolve()` — Revolve this 2D sketch around the Y axis to create a 3D solid of revolution.

```ts
revolve(degrees?: number, segments?: number): Shape
```

**Placement**

#### `attachTo()` — Position this sketch relative to another using named anchor points.

Computes the translation needed to align `selfAnchor` on this sketch with `targetAnchor` on the target sketch, then applies an optional pixel-exact offset.

Anchor positions: `'center'` | `'top-left'` | `'top-right'` | `'bottom-left'` | `'bottom-right'` | `'top'` | `'bottom'` | `'left'` | `'right'`

```ts
const arm = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left');
const shifted = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left', [5, 0]);
```

```ts
attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: [ number, number ]): Sketch
```

#### `onFace()` — Place this sketch on a face or planar target in 3D space.

Use this when a 2D profile should be oriented onto a 3D face before extrusion or other downstream operations.

```ts
onFace(parentOrFace: Shape | { toShape(): Shape; } | { _bbox(): { min: number[]; max: number[]; }; } | FaceRef, faceOrOpts?: "front" | "back" | "left" | "right" | "top" | "bottom" | string | FaceRef | { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor; }, opts?: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor; }): Sketch
```

**Labels**

#### `labelEdge()` — Label the single boundary edge (for circles, single-loop profiles). Returns a new sketch.

```ts
labelEdge(name: string): Sketch
```

#### `labelEdges()` — Label edges in winding order, or by named map for rect.

Positional: `labelEdges('bottom', 'right', 'top', 'left')` — one per edge, `null` to skip. Named (rect only): `labelEdges({ bottom: 'floor', top: 'ceiling' })`. Returns a new sketch.

```ts
labelEdges(...args: (string | null)[] | [ Record<string, string> ]): Sketch
```

#### `edgeLabels()` — List current edge label names.

```ts
edgeLabels(): string[]
```

#### `prefixLabels()` — Prefix all edge labels. Returns a new sketch with prefixed labels.

```ts
prefixLabels(prefix: string): Sketch
```

#### `renameLabel()` — Rename a single edge label. Returns a new sketch.

```ts
renameLabel(from: string, to: string): Sketch
```

#### `dropLabels()` — Remove specific labels. Returns a new sketch.

```ts
dropLabels(...names: string[]): Sketch
```

#### `dropAllLabels()` — Remove all labels. Returns a new sketch.

```ts
dropAllLabels(): Sketch
```

**Measurement**

#### `area()` — Return the total filled area of the sketch.

```ts
area(): number
```

#### `bounds()` — Return the axis-aligned bounding box of the sketch.

```ts
bounds(): ProfileBounds
```

#### `isEmpty()` — Return `true` if the sketch contains no filled area.

```ts
isEmpty(): boolean
```

#### `numVert()` — Return the number of vertices in the polygon representation of the sketch contours.

```ts
numVert(): number
```

#### `toPolygons()` — Return the sketch as a list of polygons matching its contour topology.

Useful when you need raw polygon data for inspection or custom export.

```ts
toPolygons(): number[][][]
```

**Other**

#### `color()` — Set the display color of this sketch.

Color is preserved through all transforms and boolean operations. Pass `undefined` to clear the color.

```ts
circle2d(20).color('#ff0000').extrude(5);
```

```ts
color(value: string | undefined): Sketch
```

#### `clone()` — Create an explicit copy of this sketch for branching variants.

Because all Sketch operations are immutable, `clone()` is rarely needed. Use it when you want to assign the same sketch to multiple names and continue modifying each independently without confusion.

```ts
clone(): Sketch
```

### `ConstrainedSketchBuilder`

**Drawing**

#### `moveTo()` — Move the cursor to `(x, y)` and start a new profile loop.

```ts
moveTo(x: number, y: number): this
```

#### `lineTo()` — Draw a line from the current cursor to `(x, y)`.

```ts
lineTo(x: number, y: number): this
```

#### `lineH()` — Draw a horizontal line of length `dx` from the current cursor.

```ts
lineH(dx: number): this
```

#### `lineV()` — Draw a vertical line of length `dy` from the current cursor.

```ts
lineV(dy: number): this
```

#### `lineAngled()` — Draw a line of the given `length` at `degrees` from +X.

```ts
lineAngled(length: number, degrees: number): this
```

#### `arcTo()` — Draw a circular arc from the current cursor to `(x, y)` with the given radius.

```ts
arcTo(x: number, y: number, radius: number, clockwise?: boolean): this
```

#### `arcByCenter()` — Create an arc from an explicit center point and endpoint IDs.

```ts
arcByCenter(centerId: PointId, startId: PointId, endId: PointId, clockwise?: boolean, name?: string, fixedRadius?: boolean): ArcId
```

#### `bezier()` — Create a cubic Bezier curve from four control points.

```ts
bezier(p0: any, p1: any, p2: any, p3: any, name?: string): BezierId
```

#### `bezierTo()` — Draw a cubic Bezier from the current cursor to `(x3, y3)`.

```ts
bezierTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this
```

#### `blendTo()` — Draw a smooth Bezier tangent to the previous arc.

```ts
blendTo(x: number, y: number, weight?: number): this
```

#### `label()` — Label the current path segment.

```ts
label(name: string): this
```

#### `close()` — Close the current path and register the loop.

```ts
close(): this
```

#### `addLoopCircle()` — Add a circle loop to the path.

```ts
addLoopCircle(center: PointId, radius: number, segments?: number): this
```

#### `addLoop()` — Add a closed polygon loop from point IDs.

```ts
addLoop(points: any[]): this
```

#### `addProfileLoop()` — Add a profile loop from prebuilt line/arc/bezier segments.

```ts
addProfileLoop(segments: Array<{ kind: "line"; line: any; } | { kind: "arc"; arc: any; } | { kind: "bezier"; bezier: any; }>): this
```

**Entities**

#### `point()` — Add a free point to the sketch at `(x, y)`.

If `x` or `y` are omitted, the point is placed at the bounding-box center of existing geometry so it starts near other entities rather than at the origin. Throws if either coordinate is `NaN` or `Infinity`.

```ts
point(x?: number, y?: number, fixed?: boolean): PointId
```

#### `pointAt()` — Return the `PointId` of the point created at the given insertion index.

```ts
pointAt(index: number): PointId
```

#### `line()` — Connect two existing points with a line segment.

Pass `construction = true` for a helper line that participates in constraints but is excluded from the solved sketch output (not part of any profile loop).

```ts
const axis = sk.line(sk.point(0, -50), sk.point(0, 50), true);
sk.symmetric(p1, p2, axis);
```

```ts
line(a: PointId, b: PointId, construction?: boolean, name?: string): LineId
```

#### `lineAt()` — Return the `LineId` of the line created at the given insertion index.

```ts
lineAt(index: number): LineId
```

#### `circle()` — Add a circle to the sketch with the given center point and initial radius.

The radius is a starting value — if you add a `radius()` or `diameter()` constraint, the solver will adjust it. Non-construction circles automatically register a loop.

```ts
circle(center: PointId, radius: number, construction?: boolean, segments?: number, name?: string): CircleId
```

#### `circleAt()` — Return the `CircleId` of the circle created at the given insertion index.

```ts
circleAt(index: number): CircleId
```

#### `shape()` — Register a named shape (closed polygon) from an ordered list of line IDs.

The `ShapeId` can be passed to `shapeWidth()`, `shapeHeight()`, `shapeArea()`, `shapeCentroidX()`, `shapeCentroidY()`, and `shapeEqualCentroid()` constraints. Shape registration is done automatically by concept factories like `rect()` and `addPolygon()`.

```ts
shape(lines: LineId[]): ShapeId
```

#### [`group()`](/docs/core#group) — Create a rigid-body group with a local coordinate frame.

Points and lines added to the group move together as a unit — the solver sees 3 DOF (x, y, θ) instead of 2N per point. After configuring the group, call `.done()` to register it and receive a `SketchGroupHandle`.

Group points are addressable by their `PointId` in all sketch constraints (e.g. `sk.coincident`, `sk.distance`) just like any other points.

```ts
const g = sk.group({ x: 50, y: 30 });
const p0 = g.point(0, 0);    // local origin → world (50, 30)
const p1 = g.point(100, 0);  // local (100,0) → world (150, 30)
const l = g.line(p0, p1);
g.fixRotation();
const handle = g.done();
// p0, p1 work in constraints like any other PointId:
sk.coincident(p0, someExternalPoint);
```

```ts
group(opts?: { x?: number; y?: number; theta?: number; id?: string; }): SketchGroupBuilder
```

#### `rect()` — Add an axis-aligned rectangle concept. Returns a `ConstrainedRect` handle with named vertices, sides, and center.

```ts
rect(options?: RectOptions): ConstrainedRect
```

#### `addPolygon()` — Add a general polygon concept (CCW winding enforced). Returns a `ConstrainedPolygon` handle.

```ts
addPolygon(options: PolygonOptions): ConstrainedPolygon
```

#### `regularPolygon()` — Add a regular n-gon concept (equal sides, CCW winding). Returns a `ConstrainedRegularPolygon` handle with a center point.

```ts
regularPolygon(options: RegularPolygonOptions): ConstrainedRegularPolygon
```

#### `groupRect()` — Add a rigid rectangle as a group concept. Returns a `ConstrainedGroupRect` handle with named vertices and sides. The rectangle is fixed in shape — only position (and optionally rotation) varies.

```ts
groupRect(options: GroupRectOptions): ConstrainedGroupRect
```

**Geometric Constraints**

#### `horizontal()` — Constrain a line to be horizontal (parallel to the X axis).

```ts
horizontal(line: any): this
```

#### `vertical()` — Constrain a line to be vertical (parallel to the Y axis).

```ts
vertical(line: any): this
```

#### `parallel()` — Constrain two lines to be parallel.

```ts
parallel(a: any, b: any): this
```

#### `sameDirection()` — Constrain two lines to point in the same direction.

```ts
sameDirection(a: any, b: any): this
```

#### `oppositeDirection()` — Constrain two lines to point in opposite directions.

```ts
oppositeDirection(a: any, b: any): this
```

#### `perpendicular()` — Constrain two lines to be perpendicular.

```ts
perpendicular(a: any, b: any): this
```

#### `tangent()` — Constrain a line/circle or circle/circle tangency relationship.

```ts
tangent(a: any, b: any): this
```

#### `collinear()` — Constrain a point to lie on the infinite extension of a line.

```ts
collinear(point: any, line: any): this
```

#### `symmetric()` — Constrain two points to be symmetric about an axis line.

```ts
symmetric(a: any, b: any, axis: any): this
```

#### `blockRotation()` — Prevent 180° rotation of a polygon by anchoring its first edge.

```ts
blockRotation(points: any[], axis?: "x" | "y"): this
```

**Dimensional Constraints**

#### `distance()` — Constrain the Euclidean distance between two points.

```ts
distance(a: any, b: any, value: number): this
```

#### `length()` — Constrain the length of a line segment.

```ts
length(line: any, value: number): this
```

#### `angle()` — Constrain the signed angle from line `a` to line `b`.

```ts
angle(a: any, b: any, value: number): this
```

#### `radius()` — Constrain the radius of a circle.

```ts
radius(circle: any, value: number): this
```

#### `diameter()` — Constrain the diameter of a circle.

```ts
diameter(circle: any, value: number): this
```

#### `hDistance()` — Constrain the horizontal distance between two points.

```ts
hDistance(a: any, b: any, value: number): this
```

#### `vDistance()` — Constrain the vertical distance between two points.

```ts
vDistance(a: any, b: any, value: number): this
```

#### `pointLineDistance()` — Constrain the signed perpendicular distance from a point to a line.

```ts
pointLineDistance(point: any, line: any, value: number): this
```

#### `lineDistance()` — Constrain the perpendicular offset distance between two lines.

```ts
lineDistance(a: any, b: any, value: number): this
```

#### `absoluteAngle()` — Constrain the absolute angle of a line measured from +X.

```ts
absoluteAngle(line: any, value: number): this
```

#### `arcLength()` — Constrain the arc length of an arc.

```ts
arcLength(arc: any, value: number): this
```

#### `equalRadius()` — Constrain two circles to have equal radii.

```ts
equalRadius(a: any, b: any): this
```

#### `angleBetween()` — Constrain the unsigned angle between two lines.

```ts
angleBetween(a: any, b: any, value: number): this
```

**Coincidence & Equality**

#### `equal()` — Constrain two lines to have equal length.

```ts
equal(a: any, b: any): this
```

#### `coincident()` — Constrain two points to coincide.

```ts
coincident(a: any, b: any): this
```

#### `concentric()` — Constrain two circles to share a center.

```ts
concentric(a: any, b: any): this
```

#### `fix()` — Pin a point at a specific world location.

```ts
fix(point: any, x?: number, y?: number): this
```

#### `midpoint()` — Constrain a point to lie at the midpoint of a line.

```ts
midpoint(point: any, line: any): this
```

#### `pointOnCircle()` — Constrain a point to lie on the perimeter of a circle.

```ts
pointOnCircle(point: any, circle: any): this
```

#### `pointOnLine()` — Constrain a point to lie on the bounded segment of a line.

```ts
pointOnLine(point: any, line: any): this
```

#### `ccw()` — Constrain all given points to be in counter-clockwise order.

```ts
ccw(...points: any[]): this
```

**Tangent Transitions**

#### `lineTangentArc()` — Constrain a line to be tangent to an arc at its start or end point.

```ts
lineTangentArc(line: any, arc: any, atStart: boolean): this
```

#### `arcTangentArc()` — Constrain two arcs to be tangent at their shared junction point.

```ts
arcTangentArc(arcA: any, arcB: any, aAtStart?: boolean, bAtStart?: boolean): this
```

#### `bezierTangentArc()` — Constrain a Bezier to be tangent to an arc at one endpoint.

```ts
bezierTangentArc(bezier: any, arc: any, atBezierStart: boolean, atArcStart: boolean): this
```

#### `smoothBlend()` — Create a Bezier blend between two arcs.

```ts
smoothBlend(arc1: any, arc2: any, options?: { weight?: number; arc1End?: "start" | "end"; arc2End?: "start" | "end"; }): BezierId
```

**Shape Constraints**

#### `shapeWidth()` — Constrain a shape's width.

```ts
shapeWidth(shape: any, value: number): this
```

#### `shapeHeight()` — Constrain a shape's height.

```ts
shapeHeight(shape: any, value: number): this
```

#### `shapeCentroidX()` — Constrain a shape's centroid X position.

```ts
shapeCentroidX(shape: any, value: number): this
```

#### `shapeCentroidY()` — Constrain a shape's centroid Y position.

```ts
shapeCentroidY(shape: any, value: number): this
```

#### `shapeArea()` — Constrain a shape's area.

```ts
shapeArea(shape: any, value: number): this
```

#### `shapeEqualCentroid()` — Constrain two shapes to have the same centroid.

```ts
shapeEqualCentroid(a: any, b: any): this
```

**Positioning**

#### `offsetX()` — Constrain the horizontal (X-axis) offset between two lines. Uses the start-point of each line to measure horizontal distance. `value` is the signed distance: b.startPt.x − a.startPt.x = value.

```ts
offsetX(a: any, b: any, value: number): this
```

#### `offsetY()` — Constrain the vertical (Y-axis) offset between two lines. Uses the start-point of each line to measure vertical distance. `value` is the signed distance: b.startPt.y − a.startPt.y = value.

```ts
offsetY(a: any, b: any, value: number): this
```

#### `importPoint()` — Import a `Point2D` object into the sketch.

```ts
importPoint(pt: { x: number; y: number; }, fixed?: boolean): PointId
```

#### `importLine()` — Import a `Line2D` object into the sketch.

```ts
importLine(l: { start: { x: number; y: number; }; end: { x: number; y: number; }; }, fixed?: boolean): LineId
```

#### `importRectangle()` — Import a `Rectangle2D` as four points and four lines.

```ts
importRectangle(r: { vertices: [ { x: number; y: number; }, { x: number; y: number; }, { x: number; y: number; }, { x: number; y: number; } ]; }, fixed?: boolean): { ... }
```

#### `referencePoint()` — Add a fixed reference point at `(x, y)`.

```ts
referencePoint(x: number, y: number): PointId
```

#### `referenceLine()` — Add a fixed reference line from `(x1, y1)` to `(x2, y2)`.

```ts
referenceLine(x1: number, y1: number, x2: number, y2: number): LineId
```

#### `referenceFrom()` — Import a single named entity from a solved sketch as fixed reference geometry.

```ts
referenceFrom(source: ConstraintSketch, entityId: string): PointId | LineId | null
```

#### `referenceAllFrom()` — Import all non-construction entities from a solved sketch as fixed references.

```ts
referenceAllFrom(source: ConstraintSketch): { points: Map<string, PointId>; lines: Map<string, LineId>; }
```

**Solving**

#### `constrain()` — Add a raw constraint object to the builder.

```ts
constrain(constraint: Omit<SketchConstraint, "id">): this
```

#### `solve()` — Run the constraint solver and return a solved sketch.

The returned `ConstraintSketch` extends `Sketch` and can be used directly in all 3D operations (`extrude`, `revolve`, etc.). It also exposes `constraintMeta` with the solver status:

```ts
const result = sk.solve();
result.constraintMeta.status;   // 'fully' | 'under' | 'over' | 'over-redundant'
result.constraintMeta.dof;      // 0 = fully constrained
result.constraintMeta.maxError; // residual — should be < 1e-6
result.inspect();               // human-readable summary
result.withUpdatedConstraint('cst-5', 120); // update a dimension without rebuilding
```

**Troubleshooting**

- **Under-constrained (dof > 0)** — add `fix()`, `length()`, or other dimensional constraints.
- **Over-constrained** — conflicting constraints are auto-rejected. Check `result.constraintMeta.constraints` and `result.inspect()`.
- **maxError > 1e-6** — solver did not converge; check for contradictory constraints.

```ts
solve(options?: SolveOptions): ConstraintSketch | Sketch
```

#### `solveConstraintsOnly()` — Run the solver without building a full `ConstraintSketch`.

Lighter than `solve()` — skips profile and DOF analysis. Useful for lightweight constraint validation or progress monitoring mid-construction.

```ts
solveConstraintsOnly(options?: SolveOptions): { maxError: number; rejectedCount: number; definition: ConstraintDefinition; }
```

#### `route()` — Start a directional route from coordinates.

Returns a [`RouteBuilder`](/docs/viewport#routebuilder) - describe the path with up/down/left/right/arcLeft/arcRight. Each method returns the entity ID (`LineId` or `ArcId`) for use in `sk.*` constraints.

```js
const r = sk.route(0, 0);
const stem = r.up(18);
r.arcLeft(8.9);
const neck = r.down();
r.done();
sk.offsetX(stem, neck, 10.8);
```

```ts
route(x: number, y: number): RouteBuilder
```

### `ConstraintSketch`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `constraintMeta` | `SketchConstraintMeta` | — |
| `definition` | `ConstraintDefinition` | — |

**Methods:**

#### `detectArrangement()` — Enumerate all bounded regions formed by the line arrangement of this sketch. Construction lines are excluded. Regions are returned largest-first by area.

```ts
detectArrangement(): Sketch[]
```

#### `detectArrangementRegion()` — Select the single arrangement region that contains the given seed point. Throws if no region contains the seed.

```ts
detectArrangementRegion(_seed: [ number, number ]): Sketch
```

#### `toPolyline()` — Return the solved constrained path as a sampled 2D polyline.

Use this when a construction rail was authored with `constrainedSketch()` and should feed another operation such as `Loft.pathOnXz(...)`. The sketch must contain exactly one profile path.

```ts
toPolyline(samples?: number): [ number, number ][]
```

#### `withUpdatedConstraint()` — Re-solve the sketch after changing the value of one existing constraint.

Use this for interactive dimension edits without rebuilding the whole sketch graph. It attempts a warm-started solve first, then falls back to a full solve if needed.

```ts
withUpdatedConstraint(constraintId: string, value: number): ConstraintSketch
```

#### `inspect()` — Return a human-readable diagnostic string of the solved state.

```ts
inspect(): string
```

### `SketchGroupBuilder`

#### `point()` — Add a point in local coordinates. Returns its globally-addressable PointId.

```ts
point(lx: number, ly: number): PointId
```

#### `line()` — Connect two group points with a line. Both must be PointIds from this group.

```ts
line(a: PointId, b: PointId, name?: string): LineId
```

#### `fixRotation()` — Freeze rotation (theta). Group can still translate - 2 DOF remain.

```ts
fixRotation(): this
```

#### `fix()` — Freeze all 3 DOF - group is completely fixed.

```ts
fix(): this
```

#### `done()` — Finalize and register the group with the builder.

```ts
done(): SketchGroupHandle
```

### `Point2D`

An immutable 2D point with measurement and construction helpers.

Used as construction geometry in sketches, constraints, and analytic measurements. All methods return new instances — `Point2D` is immutable.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | — |
| `y` | `number` | — |

**Methods:**

#### `distanceTo()` — Measure straight-line distance to another point.

```ts
distanceTo(other: Point2D): number
```

#### `midpointTo()` — Compute the midpoint between this point and another point.

```ts
midpointTo(other: Point2D): Point2D
```

#### `translate()` — Return a point shifted by the given delta.

```ts
translate(dx: number, dy: number): Point2D
```

#### `toTuple()` — Convert this point to a plain `[x, y]` tuple.

```ts
toTuple(): [ number, number ]
```

### `Line2D`

An immutable 2D line segment with length, angle, intersection, and parallel helpers.

Provides both segment-only (`intersectSegment`) and infinite-line (`intersect`) intersection queries. All methods return new instances.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `start` | `Point2D` | — |
| `end` | `Point2D` | — |

**Methods:**

#### `length()` — Length of the line segment.

```ts
get length(): number
```

#### `midpoint()` — Midpoint of the line segment.

```ts
get midpoint(): Point2D
```

#### `angle()` — Direction angle in degrees, measured CCW from +X.

```ts
get angle(): number
```

#### `direction()` — Unit direction vector from start to end.

```ts
get direction(): [ number, number ]
```

#### `parallel()` — Create a parallel line offset by the given distance.

Positive distance shifts to the left of the line direction.

```ts
parallel(distance: number): Line2D
```

#### `intersect()` — Intersect this line with another infinite line.

```ts
intersect(other: Line2D): Point2D | null
```

#### `intersectSegment()` — Intersect this line with another as bounded segments.

```ts
intersectSegment(other: Line2D): Point2D | null
```

#### `fromCoordinates()` — Create a line from raw coordinates.

```ts
static fromCoordinates(x1: number, y1: number, x2: number, y2: number): Line2D
```

#### `fromPointAndAngle()` — Create a line from a start point, angle, and length.

```ts
static fromPointAndAngle(origin: Point2D, angleDeg: number, length: number): Line2D
```

#### `fromPointAndDirection()` — Create a line from a start point, direction vector, and length.

```ts
static fromPointAndDirection(origin: Point2D, dir: [ number, number ], length: number): Line2D
```

### `Circle2D`

An immutable 2D circle with area, circumference, and extrusion support.

Extruding a `Circle2D` produces a cylinder with named `top`, `bottom`, and `side` faces accessible via the topology API.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `center` | `Point2D` | — |
| `radius` | `number` | — |

**Methods:**

#### `diameter()` — Diameter of the circle.

```ts
get diameter(): number
```

#### `circumference()` — Circumference of the circle.

```ts
get circumference(): number
```

#### `area()` — Area of the circle.

```ts
get area(): number
```

#### `pointAtAngle()` — Return a point on the circle at the given angle.

```ts
pointAtAngle(angleDeg: number): Point2D
```

#### `translate()` — Return a translated circle.

```ts
translate(dx: number, dy: number): Circle2D
```

#### `toSketch()` — Convert this circle to a sketch profile.

```ts
toSketch(segments?: number): Sketch
```

#### `extrude()` — Extrude the circle into a solid cylinder.

```ts
extrude(height: number, segments?: number): Shape
```

#### `fromCenterAndRadius()` — Create a circle from its center and radius.

```ts
static fromCenterAndRadius(center: Point2D, radius: number): Circle2D
```

#### `fromDiameter()` — Create a circle from its center and diameter.

```ts
static fromDiameter(center: Point2D, diameter: number): Circle2D
```

### `Rectangle2D`

A rectangle with named sides, vertices, and extrusion support.

Sides are named based on the rectangle's local orientation at construction time. Vertices go: bottom-left, bottom-right, top-right, top-left (CCW).

Use `rect()` for the normal centered sketch primitive. Use `Rectangle2D` when you need named sides/vertices, or an extrusion with tracked vertical edges such as `vert-br` for `filletTrackedEdge()` / `chamferTrackedEdge()`.

Extruding a `Rectangle2D` produces a [`Shape`](/docs/core#shape) with named faces: `top`, `bottom`, `side-left`, `side-right`, `side-top`, `side-bottom`. These are accessible via the topology API (`.face()`, `.edge()`).

```ts
const r = Rectangle2D.fromDimensions(0, 0, 100, 60);
r.side('top'); r.side('left');     // Line2D
r.vertex('top-left');              // Point2D
r.width; r.height; r.center;
const [d1, d2] = r.diagonals();   // [bl-tr, br-tl]

r.toSketch();      // Sketch (for 2D operations)
r.extrude(20);     // Shape with named faces

Rectangle2D.fromCenterAndDimensions(point(50, 30), 100, 60);
Rectangle2D.from2Corners(point(0, 0), point(100, 60));
Rectangle2D.from3Points(p1, p2, p3);  // free-angle rectangle
```

#### `width()` — Width of the rectangle.

```ts
get width(): number
```

#### `height()` — Height of the rectangle.

```ts
get height(): number
```

#### `center()` — Geometric center of the rectangle.

```ts
get center(): Point2D
```

#### `side()` — Return a named side of the rectangle.

```ts
side(name: RectSide): Line2D
```

#### `sideAt()` — Return a side by index.

```ts
sideAt(index: number): Line2D
```

#### `vertex()` — Return a named vertex of the rectangle.

```ts
vertex(name: RectVertex): Point2D
```

#### `diagonals()` — Return the two diagonals of the rectangle.

```ts
diagonals(): [ Line2D, Line2D ]
```

#### `toSketch()` — Convert the rectangle to a sketch profile.

```ts
toSketch(): Sketch
```

#### `translate()` — Return a translated rectangle.

```ts
translate(dx: number, dy: number): Rectangle2D
```

#### `fromDimensions()` — Create an axis-aligned rectangle from origin corner plus width and height.

```ts
static fromDimensions(x: number, y: number, width: number, height: number): Rectangle2D
```

#### `fromCenterAndDimensions()` — Create a rectangle centered on a point.

```ts
static fromCenterAndDimensions(center: Point2D, width: number, height: number): Rectangle2D
```

#### `from2Corners()` — Create an axis-aligned rectangle from two opposite corners.

```ts
static from2Corners(p1: Point2D, p2: Point2D): Rectangle2D
```

#### `from3Points()` — Create a free-angle rectangle from three points.

`p1` and `p2` define one edge, and `p3` chooses the perpendicular side.

```ts
static from3Points(p1: Point2D, p2: Point2D, p3: Point2D): Rectangle2D
```

#### `extrude()` — Extrude the rectangle into a solid prism with named topology.

```ts
extrude(height: number, up?: boolean): Shape
```

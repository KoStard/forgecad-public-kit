---
skill-group: sketch
skill-order: 100
---

# Sketch API

2D geometry creation, transforms, booleans, constrained sketches, and extrusion.

## Contents

- [2D Sketch Primitives](#2d-sketch-primitives)
- [2D Sketch Booleans](#2d-sketch-booleans)
- [2D Text](#2d-text)
- [Constrained Sketches](#constrained-sketches)
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

#### `path(): PathBuilder` — Create a new [`PathBuilder`](/docs/curves#pathbuilder) for tracing a 2D outline point by point.

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

#### `stroke(points: Vec2[], width: number, join?: "Round" | "Square"): Sketch` — Thicken a 2D polyline (centerline) into a solid filled profile of uniform width.

Standalone equivalent of `path()...stroke(width, join)`. Use for centerline-based geometry — ribs, wire traces, brackets. For rounding corners of a *closed* outline use `.filletCorners(radius)` (all corners) or `.filletCorner([x, y], radius)` (one corner) instead.

#### `rect(width: number, height: number): Sketch` — Create a 2D rectangle centered at the origin.

```ts
rect(40, 20).extrude(5);
```

#### `circle2d(radius: number, segments?: number): Sketch` — Create a 2D circle centered at the origin.

Omit `segments` for a smooth (auto-tessellated) circle. Pass an integer to get a regular polygon approximation — e.g. `6` for a hexagon, `8` for an octagon.

```ts
circle2d(25).extrude(10);          // smooth cylinder
circle2d(25, 6).extrude(10);       // hexagonal prism
```

#### `roundedRect(width: number, height: number, radius: number): Sketch` — Create a 2D rectangle with rounded corners, centered at the origin.

The corner radius is automatically clamped to `min(width/2, height/2)` so it can never exceed the shape dimensions.

```ts
roundedRect(60, 30, 5).extrude(3);
```

#### `polygon(points: (Vec2 | Point2D)[]): Sketch` — Create a 2D polygon from an array of `[x, y]` points or `Point2D` objects.

Winding order is normalized automatically — clockwise (CW) input is silently reversed to CCW before being passed to the geometry kernel.

```ts
polygon([[0, 0], [50, 0], [25, 40]]).extrude(5); // triangle
```

#### `ngon(sides: number, radius: number): Sketch` — Create a regular polygon inscribed in a circle of the given radius.

`radius` is the center-to-vertex (circumradius) distance. Use `sides` of `3` for a triangle, `6` for a hexagon, etc. The first vertex is at the top (−90° from +X).

```ts
ngon(6, 20).extrude(10); // hexagonal prism, circumradius 20
```

#### `ellipse(rx: number, ry: number, segments?: number): Sketch` — Create a 2D ellipse centered at the origin.

```ts
ellipse(30, 15).extrude(5);
ellipse(30, 15, 32).extrude(5); // lower-resolution approximation
```

#### `slot(length: number, width: number): Sketch` — Create a slot (oblong / stadium shape) — a rectangle with semicircular ends, centered at the origin.

```ts
slot(40, 10).extrude(3); // 40mm long, 10mm wide slot
```

#### `arcSlot(pitchRadius: number, sweepDeg: number, thickness: number): Sketch` — Create an arc-shaped slot (banana / annular sector) centered at the origin.

The slot is symmetric about the +X axis. The two ends are closed with semicircular caps. `pitchRadius` is the distance from the origin to the centerline of the slot, and `thickness` is the radial width of the slot.

```ts
arcSlot(135, 74, 40).extrude(5); // pitch R135, 74° sweep, 40mm wide
```

### 2D Sketch Booleans

#### `union2d(...inputs: SketchOperandInput[]): Sketch` — Combine 2D sketches into a single profile using an additive boolean union.

Accepts individual sketches or arrays: `union2d(a, b, c)` or `union2d([a, b, c])`. Uses Manifold's batch operation — faster than chaining `.add()` one by one when combining many sketches.

```ts
const cross = union2d(rect(60, 10), rect(10, 60));
```

#### `difference2d(...inputs: SketchOperandInput[]): Sketch` — Subtract one or more 2D sketches from a base sketch.

The first sketch is the base; all subsequent sketches are subtracted from it. Accepts individual sketches or arrays: `difference2d(base, c1, c2)` or `difference2d([base, c1, c2])`. Uses Manifold's batch operation — faster than chaining `.subtract()` one by one.

```ts
const donut = difference2d(circle2d(50), circle2d(30));
```

#### `intersection2d(...inputs: SketchOperandInput[]): Sketch` — Keep only the area where all input sketches overlap (intersection boolean).

Accepts individual sketches or arrays: `intersection2d(a, b)` or `intersection2d([a, b, c])`. Uses Manifold's batch operation — faster than chaining `.intersect()` one by one.

```ts
const lens = intersection2d(circle2d(30).translate(-10, 0), circle2d(30).translate(10, 0));
```

### 2D Text

#### `loadFont(source: string | ArrayBuffer, cacheKey?: string): opentype.Font` — Pre-load and cache a font for use with `text2d()`.

Fonts are cached by their source string (or `cacheKey` for `ArrayBuffer` sources), so repeated calls with the same path are free. Pre-loading is useful when you call `text2d()` many times with the same font — it avoids repeated disk reads.

Built-in font names that work everywhere (browser + CLI):

- `'sans-serif'` or `'inter'` — bundled Inter Regular

```ts
const font = loadFont('/path/to/Arial Bold.ttf');
text2d('Title', { size: 12, font }).extrude(1.5);
text2d('Subtitle', { size: 8, font }).extrude(1);
```

#### `text2d(content: string, options?: TextOptions): Sketch` — Build a filled 2D Sketch from a text string.

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

**`TextOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `size?` | `number` | Cap height of the text in model units. All other dimensions (stroke weight, spacing) scale proportionally. |
| `letterSpacing?` | `number` | Extra space between characters in model units. Negative values tighten the tracking. |
| `align?` | `"left" \| "center" \| "right"` | Horizontal alignment relative to x = 0. - `'left'` — left edge at x = 0 (default) - `'center'` — centred on x = 0 - `'right'` — right edge at x = 0 |
| `baseline?` | `"baseline" \| "center" \| "top"` | Vertical alignment relative to y = 0. - `'baseline'` — y = 0 is the text baseline (bottom of capital letters) - `'center'` — y = 0 is the vertical midpoint of the cap height - `'top'` — y = 0 is the top of capital letters |
| `font?` | `string \| opentype.Font` | Font to use for text rendering. - `'sans-serif'` or `'inter'` — bundled Inter font (works everywhere, including browser) - **file path** — path to a TTF, OTF, or WOFF font file (CLI/Node only) - **Font object** — a previously loaded opentype.js Font (from `loadFont()`) - **omitted** — uses the bundled Inter font (same as `'sans-serif'`) |
| `flattenTolerance?` | `number` | Bezier flattening tolerance in model units. Smaller = more polygon segments = smoother curves. |

#### `textWidth(content: string, options?: Pick<TextOptions, "size" | "letterSpacing" | "font">): number` — Measure the rendered advance width of a string without creating any geometry.

Uses the same font metrics as `text2d()`. Useful for computing layout dimensions before building the actual sketch — e.g. sizing a plate to fit a label.

```ts
const w = textWidth('SERIAL: 001', { size: 6 });
const plate = box(w + 10, 12, 2);
```

### Constrained Sketches

#### `constrainedSketch(options?: ConstrainedSketchOptions): ConstrainedSketchBuilder` — Create a parametric 2D sketch driven by geometric constraints and a nonlinear solver.

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

**`ConstrainedSketchOptions`**
- `strict?: boolean` — When true, adding a constraint that cannot be satisfied throws instead of silently discarding it.

---

## Classes

### `Sketch`

Immutable 2D profile for extrusion, revolve, and other operations.

`Sketch` wraps Manifold's `CrossSection` with a chainable 2D API. Every method returns a new `Sketch` — the original is never mutated. Colors, edge labels, and placement data are preserved through all transforms and boolean operations.

Supported operations:

- **Transforms** — `translate`, `rotate`, `rotateAround`, `scale`, `mirror`
- **Booleans** — `add` (union), `subtract` (difference), `intersect`
- **Operations** — `offset`, `simplify`, `filletCorners`, `filletCorner`, `chamferCorners`, `chamferCorner`
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

#### `translate(x: number, y?: number): Sketch` — Move the sketch by the given X and Y offset.

#### `rotate(degrees: number): Sketch` — Rotate the sketch around its bounding-box center.

#### `rotateAround(degrees: number, pivot: Vec2): Sketch` — Rotate the sketch around a specific pivot point.

```ts
rect(20, 20).rotateAround(45, [0, 0]);
```

#### `scale(v: number | Vec2): Sketch` — Scale the sketch relative to its bounding-box center.

Pass a single number for uniform scaling, or `[sx, sy]` for per-axis scaling.

#### `scaleAround(pivot: Vec2, v: number | Vec2): Sketch` — Scale the sketch relative to an arbitrary pivot point.

#### `mirror(normal: Vec2): Sketch` — Mirror the sketch across a line through its bounding-box center.

`normal` is the normal vector of the mirror line (not the line direction). For example, `[1, 0]` mirrors across a vertical line (Y axis direction), and `[0, 1]` mirrors across a horizontal line.

#### `mirrorThrough(point: Vec2, normal: Vec2): Sketch` — Mirror the sketch across a line defined by a point and a normal direction.

**Booleans**

#### `add(...others: SketchOperandInput[]): Sketch` — Add (union) one or more sketches to this sketch.

Accepts individual sketches or arrays: `sketch.add(a, b)` or `sketch.add([a, b])`. For combining many sketches at once, prefer the free function `union2d()` which uses Manifold's batch operation and is faster than chaining.

```ts
circle2d(20).add(rect(10, 30)).extrude(5);
```

#### `subtract(...others: SketchOperandInput[]): Sketch` — Subtract one or more sketches from this sketch.

Accepts individual sketches or arrays: `sketch.subtract(a, b)` or `sketch.subtract([a, b])`. For subtracting many cutters at once, prefer the free function `difference2d()`.

```ts
rect(40, 40).subtract(circle2d(10)).extrude(5);
```

#### `intersect(...others: SketchOperandInput[]): Sketch` — Intersect this sketch with one or more others (keep overlapping area only).

Accepts individual sketches or arrays: `sketch.intersect(a, b)` or `sketch.intersect([a, b])`. For intersecting many sketches, prefer the free function `intersection2d()`.

**Features**

#### `offset(delta: number, join?: "Square" | "Round" | "Miter"): Sketch` — Inflate (positive delta) or deflate (negative delta) the sketch contour.

For rounding corners, prefer `filletCorners(radius)` (all corners) or `filletCorner([x, y], radius)` (one corner) — they round only true corners and keep concave geometry exact.

- `'Round'` — smooth arc at each corner (default)
- `'Square'` — flat mitered extension
- `'Miter'` — sharp pointed extension

```ts
rect(40, 20).offset(3); // expand by 3
```

#### `filletCorners(radius: number): Sketch` — Round every significant corner of this sketch with the same fillet radius.

Works on any sketch — primitives, boolean results, attached or composed profiles. A vertex counts as a corner when its turn angle is at least 30°, so vertices that belong to tessellated circles or earlier fillets are left untouched. Both convex and concave corners are rounded. Holes are preserved, and their corners are rounded too.

Throws if the sketch has no significant corners, or if the radius does not fit a corner (the error names the corner and the maximum radius).

```ts
rect(60, 30).filletCorners(5).extrude(4);          // rounded plate
polygon(bracketPts).filletCorners(3);              // every corner of an outline
```

#### `filletCorner(at: Vec2, radius: number): Sketch` — Round the single corner of this sketch nearest to a seed point.

Selects the significant corner (turn angle ≥ 30°) closest to `at` — the seed does not need to be exact, just nearer to the intended corner than to any other (like `region([x, y])` seed selection). Throws if two corners are equidistant from the seed, naming both so you can move the seed.

Chain calls to round several corners with different radii.

```ts
polygon(roofPts)
  .filletCorner([45, 86], 14)  // peak
  .filletCorner([24, 74], 8);  // left shoulder
```

#### `chamferCorners(size: number): Sketch` — Bevel every significant corner of this sketch with a straight chamfer.

Replaces each significant corner (turn angle ≥ 30°) with a straight cut set back `size` along both adjacent edges. Tessellated arcs are left untouched; holes are preserved. Throws if the sketch has no significant corners or the size does not fit a corner.

```ts
rect(60, 30).chamferCorners(4).extrude(4); // beveled plate outline
```

#### `chamferCorner(at: Vec2, size: number): Sketch` — Bevel the single corner of this sketch nearest to a seed point.

Selects the significant corner (turn angle ≥ 30°) closest to `at` and replaces it with a straight cut set back `size` along both adjacent edges. Throws if two corners are equidistant from the seed. Chain calls to bevel several corners with different sizes.

```ts
rect(60, 30).chamferCorner([30, 15], 6); // bevel only the top-right corner
```

#### `regions(): Sketch[]` — Decompose this sketch into its distinct filled regions, sorted largest-first by area.

A single sketch can contain several disconnected filled areas (e.g., two separate rectangles, or a ring shape with a hole). This method enumerates all top-level connected regions as independent `Sketch` objects, each with its own outer boundary and associated holes.

```ts
const pair = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
const [left, right] = pair.regions(); // largest first
left.extrude(5);
```

#### `region(seed: Vec2): Sketch` — Select the single filled region that contains the given 2D seed point.

The seed must lie strictly inside the filled area — not on a boundary edge and not inside a hole. Throws a descriptive error if the seed is outside all regions. If unsure where regions are, use `.regions()` first — each result has `.bounds()`.

```ts
const donut = circle2d(50).subtract(circle2d(30));
donut.region([40, 0]).extrude(10); // seed at radius 40, inside the ring
```

**Promotion**

#### `extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | Vec2; }): Shape` — Extrude this 2D sketch along Z to create a 3D solid. Supports twist and scale tapering.

#### `revolve(degrees?: number, segments?: number): Shape` — Revolve this 2D sketch around the world Z axis. Sketch X is radius; sketch Y becomes world Z height. Keep the profile at X > 0 unless it intentionally touches the axis.

**Placement**

#### `attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: Vec2): Sketch` — Position this sketch relative to another using named anchor points.

Computes the translation needed to align `selfAnchor` on this sketch with `targetAnchor` on the target sketch, then applies an optional pixel-exact offset.

Anchor positions: `'center'` | `'top-left'` | `'top-right'` | `'bottom-left'` | `'bottom-right'` | `'top'` | `'bottom'` | `'left'` | `'right'`

```ts
const arm = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left');
const shifted = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left', [5, 0]);
```

#### `onFace(parentOrFace: Shape | { toShape(): Shape; } | { _bbox(): { min: number[]; max: number[]; }; } | FaceRef, faceOrOpts?: "front" | "back" | "left" | "right" | "top" | "bottom" | string | FaceRef | { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor; }, opts?: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor; }): Sketch` — Place this sketch on a face or planar target in 3D space.

Use this when a 2D profile should be oriented onto a 3D face before extrusion or other downstream operations.

`FaceRef` — defined in [core](/docs/core).

**Labels**

#### `labelEdge(name: string): Sketch` — Label the single boundary edge (for circles, single-loop profiles). Returns a new sketch.

#### `labelEdges(...args: (string | null)[] | [ Record<string, string> ]): Sketch` — Label edges in winding order, or by named map for rect.

Positional: `labelEdges('bottom', 'right', 'top', 'left')` — one per edge, `null` to skip. Named (rect only): `labelEdges({ bottom: 'floor', top: 'ceiling' })`. Returns a new sketch.

#### `edgeLabels(): string[]` — List current edge label names.

#### `prefixLabels(prefix: string): Sketch` — Prefix all edge labels. Returns a new sketch with prefixed labels.

#### `renameLabel(from: string, to: string): Sketch` — Rename a single edge label. Returns a new sketch.

#### `dropLabels(...names: string[]): Sketch` — Remove specific labels. Returns a new sketch.

#### `dropAllLabels(): Sketch` — Remove all labels. Returns a new sketch.

**Measurement**

#### `area(): number` — Return the total filled area of the sketch.

#### `bounds(): ProfileBounds` — Return the axis-aligned bounding box of the sketch.

#### `isEmpty(): boolean` — Return `true` if the sketch contains no filled area.

#### `numVert(): number` — Return the number of vertices in the polygon representation of the sketch contours.

#### `toPolygons(): number[][][]` — Return the sketch as a list of polygons matching its contour topology.

Useful when you need raw polygon data for inspection or custom export.

**Other**

#### `color(value: string | undefined): Sketch` — Set the display color of this sketch.

Color is preserved through all transforms and boolean operations. Pass `undefined` to clear the color.

```ts
circle2d(20).color('#ff0000').extrude(5);
```

#### `clone(): Sketch` — Create an explicit copy of this sketch for branching variants.

Because all Sketch operations are immutable, `clone()` is rarely needed. Use it when you want to assign the same sketch to multiple names and continue modifying each independently without confusion.

### `ConstrainedSketchBuilder`

**Drawing**

#### `moveTo(x: number, y: number): this` — Move the cursor to `(x, y)` and start a new profile loop.

#### `lineTo(x: number, y: number): this` — Draw a line from the current cursor to `(x, y)`.

#### `lineH(dx: number): this` — Draw a horizontal line of length `dx` from the current cursor.

#### `lineV(dy: number): this` — Draw a vertical line of length `dy` from the current cursor.

#### `lineAngled(length: number, degrees: number): this` — Draw a line of the given `length` at `degrees` from +X.

#### `arcTo(x: number, y: number, radius: number, clockwise?: boolean): this` — Draw a circular arc from the current cursor to `(x, y)` with the given radius.

#### `arcByCenter(centerId: PointId, startId: PointId, endId: PointId, clockwise?: boolean, name?: string, fixedRadius?: boolean): ArcId` — Create an arc from an explicit center point and endpoint IDs.

#### `bezier(p0: any, p1: any, p2: any, p3: any, name?: string): BezierId` — Create a cubic Bezier curve from four control points.

#### `bezierTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this` — Draw a cubic Bezier from the current cursor to `(x3, y3)`.

#### `blendTo(x: number, y: number, weight?: number): this` — Draw a smooth Bezier tangent to the previous arc.

#### `label(name: string): this` — Label the current path segment.

#### `close(): this` — Close the current path and register the loop.

#### `addLoopCircle(center: PointId, radius: number, segments?: number): this` — Add a circle loop to the path.

#### `addLoop(points: any[]): this` — Add a closed polygon loop from point IDs.

#### `addProfileLoop(segments: Array<{ kind: "line"; line: any; } | { kind: "arc"; arc: any; } | { kind: "bezier"; bezier: any; }>): this` — Add a profile loop from prebuilt line/arc/bezier segments.

**Entities**

#### `point(x?: number, y?: number, fixed?: boolean): PointId` — Add a free point to the sketch at `(x, y)`.

If `x` or `y` are omitted, the point is placed at the bounding-box center of existing geometry so it starts near other entities rather than at the origin. Throws if either coordinate is `NaN` or `Infinity`.

#### `pointAt(index: number): PointId` — Return the `PointId` of the point created at the given insertion index.

#### `line(a: PointId, b: PointId, construction?: boolean, name?: string): LineId` — Connect two existing points with a line segment.

Pass `construction = true` for a helper line that participates in constraints but is excluded from the solved sketch output (not part of any profile loop).

```ts
const axis = sk.line(sk.point(0, -50), sk.point(0, 50), true);
sk.symmetric(p1, p2, axis);
```

#### `lineAt(index: number): LineId` — Return the `LineId` of the line created at the given insertion index.

#### `circle(center: PointId, radius: number, construction?: boolean, segments?: number, name?: string): CircleId` — Add a circle to the sketch with the given center point and initial radius.

The radius is a starting value — if you add a `radius()` or `diameter()` constraint, the solver will adjust it. Non-construction circles automatically register a loop.

#### `circleAt(index: number): CircleId` — Return the `CircleId` of the circle created at the given insertion index.

#### `shape(lines: LineId[]): ShapeId` — Register a named shape (closed polygon) from an ordered list of line IDs.

The `ShapeId` can be passed to `shapeWidth()`, `shapeHeight()`, `shapeArea()`, `shapeCentroidX()`, `shapeCentroidY()`, and `shapeEqualCentroid()` constraints. Shape registration is done automatically by concept factories like `rect()` and `addPolygon()`.

#### `group(opts?: { x?: number; y?: number; theta?: number; id?: string; }): SketchGroupBuilder` — Create a rigid-body group with a local coordinate frame.

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

#### `rect(options?: RectOptions): ConstrainedRect` — Add an axis-aligned rectangle concept. Returns a `ConstrainedRect` handle with named vertices, sides, and center.

**`RectOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `x?` | `number` | Bottom-left x coordinate. Default: 0. |
| `y?` | `number` | Bottom-left y coordinate. Default: 0. |
| `width?` | `number` | Width (along x). Default: 10. |
| `height?` | `number` | Height (along y). Default: 10. |
| `blockRotation?` | `boolean` | Prevent 180° rotation (ensures bottom edge points rightward). Default: false. |

#### `addPolygon(options: PolygonOptions): ConstrainedPolygon` — Add a general polygon concept (CCW winding enforced). Returns a `ConstrainedPolygon` handle.

**`PolygonOptions`**
- `points: ReadonlyArray<readonly Vec2>` — Initial vertex coordinates. Minimum 3 points.
- `addLoop?: boolean` — Whether to register a closed loop for sketch generation. Default: true.
- `blockRotation?: boolean` — Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false.

#### `regularPolygon(options: RegularPolygonOptions): ConstrainedRegularPolygon` — Add a regular n-gon concept (equal sides, CCW winding). Returns a `ConstrainedRegularPolygon` handle with a center point.

**`RegularPolygonOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `sides` | `number` | Number of sides (minimum 3). |
| `radius?` | `number` | Circumradius — distance from center to vertex. Default: 10. |
| `cx?` | `number` | Center x coordinate. Default: 0. |
| `cy?` | `number` | Center y coordinate. Default: 0. |
| `startAngle?` | `number` | Angle (in degrees) of vertex[0] measured from the +X axis (CCW positive). Default: 0 (rightmost vertex). |
| `blockRotation?` | `boolean` | Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false. |

#### `groupRect(options: GroupRectOptions): ConstrainedGroupRect` — Add a rigid rectangle as a group concept. Returns a `ConstrainedGroupRect` handle with named vertices and sides. The rectangle is fixed in shape — only position (and optionally rotation) varies.

**`GroupRectOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `x?` | `number` | Bottom-left x coordinate (world). Default: 0. |
| `y?` | `number` | Bottom-left y coordinate (world). Default: 0. |
| `width` | `number` | Width (along x in local coords). Required. |
| `height` | `number` | Height (along y in local coords). Required. |
| `allowRotation?` | `boolean` | Allow the solver to rotate this rectangle. Default: false. |

**Geometric Constraints**

#### `horizontal(line: any): this` — Constrain a line to be horizontal (parallel to the X axis).

#### `vertical(line: any): this` — Constrain a line to be vertical (parallel to the Y axis).

#### `parallel(a: any, b: any): this` — Constrain two lines to be parallel.

#### `sameDirection(a: any, b: any): this` — Constrain two lines to point in the same direction.

#### `oppositeDirection(a: any, b: any): this` — Constrain two lines to point in opposite directions.

#### `perpendicular(a: any, b: any): this` — Constrain two lines to be perpendicular.

#### `tangent(a: any, b: any): this` — Constrain a line/circle or circle/circle tangency relationship.

#### `collinear(point: any, line: any): this` — Constrain a point to lie on the infinite extension of a line.

#### `symmetric(a: any, b: any, axis: any): this` — Constrain two points to be symmetric about an axis line.

#### `blockRotation(points: any[], axis?: "x" | "y"): this` — Prevent 180° rotation of a polygon by anchoring its first edge.

**Dimensional Constraints**

#### `distance(a: any, b: any, value: number): this` — Constrain the Euclidean distance between two points.

#### `length(line: any, value: number): this` — Constrain the length of a line segment.

#### `angle(a: any, b: any, value: number): this` — Constrain the signed angle from line `a` to line `b`.

#### `radius(circle: any, value: number): this` — Constrain the radius of a circle.

#### `diameter(circle: any, value: number): this` — Constrain the diameter of a circle.

#### `hDistance(a: any, b: any, value: number): this` — Constrain the horizontal distance between two points.

#### `vDistance(a: any, b: any, value: number): this` — Constrain the vertical distance between two points.

#### `pointLineDistance(point: any, line: any, value: number): this` — Constrain the signed perpendicular distance from a point to a line.

#### `lineDistance(a: any, b: any, value: number): this` — Constrain the perpendicular offset distance between two lines.

#### `absoluteAngle(line: any, value: number): this` — Constrain the absolute angle of a line measured from +X.

#### `arcLength(arc: any, value: number): this` — Constrain the arc length of an arc.

#### `equalRadius(a: any, b: any): this` — Constrain two circles to have equal radii.

#### `angleBetween(a: any, b: any, value: number): this` — Constrain the unsigned angle between two lines.

**Coincidence & Equality**

#### `equal(a: any, b: any): this` — Constrain two lines to have equal length.

#### `coincident(a: any, b: any): this` — Constrain two points to coincide.

#### `concentric(a: any, b: any): this` — Constrain two circles to share a center.

#### `fix(point: any, x?: number, y?: number): this` — Pin a point at a specific world location.

#### `midpoint(point: any, line: any): this` — Constrain a point to lie at the midpoint of a line.

#### `pointOnCircle(point: any, circle: any): this` — Constrain a point to lie on the perimeter of a circle.

#### `pointOnLine(point: any, line: any): this` — Constrain a point to lie on the bounded segment of a line.

#### `ccw(...points: any[]): this` — Constrain all given points to be in counter-clockwise order.

**Tangent Transitions**

#### `lineTangentArc(line: any, arc: any, atStart: boolean): this` — Constrain a line to be tangent to an arc at its start or end point.

#### `arcTangentArc(arcA: any, arcB: any, aAtStart?: boolean, bAtStart?: boolean): this` — Constrain two arcs to be tangent at their shared junction point.

#### `bezierTangentArc(bezier: any, arc: any, atBezierStart: boolean, atArcStart: boolean): this` — Constrain a Bezier to be tangent to an arc at one endpoint.

#### `smoothBlend(arc1: any, arc2: any, options?: { weight?: number; arc1End?: "start" | "end"; arc2End?: "start" | "end"; }): BezierId` — Create a Bezier blend between two arcs.

**Shape Constraints**

#### `shapeWidth(shape: any, value: number): this` — Constrain a shape's width.

#### `shapeHeight(shape: any, value: number): this` — Constrain a shape's height.

#### `shapeCentroidX(shape: any, value: number): this` — Constrain a shape's centroid X position.

#### `shapeCentroidY(shape: any, value: number): this` — Constrain a shape's centroid Y position.

#### `shapeArea(shape: any, value: number): this` — Constrain a shape's area.

#### `shapeEqualCentroid(a: any, b: any): this` — Constrain two shapes to have the same centroid.

**Positioning**

#### `offsetX(a: any, b: any, value: number): this` — Constrain the horizontal (X-axis) offset between two lines. Uses the start-point of each line to measure horizontal distance. `value` is the signed distance: b.startPt.x − a.startPt.x = value.

#### `offsetY(a: any, b: any, value: number): this` — Constrain the vertical (Y-axis) offset between two lines. Uses the start-point of each line to measure vertical distance. `value` is the signed distance: b.startPt.y − a.startPt.y = value.

#### `referencePoint(x: number, y: number): PointId` — Add a fixed reference point at `(x, y)`.

#### `referenceLine(x1: number, y1: number, x2: number, y2: number): LineId` — Add a fixed reference line from `(x1, y1)` to `(x2, y2)`.

#### `referenceFrom(source: ConstraintSketch, entityId: string): PointId | LineId | null` — Import a single named entity from a solved sketch as fixed reference geometry.

#### `referenceAllFrom(source: ConstraintSketch): { points: Map<string, PointId>; lines: Map<string, LineId>; }` — Import all non-construction entities from a solved sketch as fixed references.

**Solving**

#### `constrain(constraint: Omit<SketchConstraint, "id">): this` — Add a raw constraint object to the builder.

#### `solve(options?: SolveOptions): ConstraintSketch | Sketch` — Run the constraint solver and return a solved sketch.

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

**`SolveOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `iterations?` | `number` | Maximum number of LM outer iterations per restart. |
| `tolerance?` | `number` | Infinity-norm residual tolerance for declaring convergence. |
| `restarts?` | `number` | Number of deterministic restart seeds used by the global solver. |
| `warmStartIterations?` | `number` | Optional projector iterations used only for initialisation, not as the main solver. |
| `maxScaledStep?` | `number` | Maximum LM step length in scaled variable space. Larger = bolder, smaller = safer. |
| `skipRedundancyCheck?` | `boolean` | Skip redundancy detection (safe when topology is unchanged and previous DOF >= 0). |
| `presolveConstraintId?` | `string` | Run the targeted presolve hook for this constraint before the main solve. |
| `fallbackRestarts?` | `number` | When set and the first solve exceeds tolerance*5, retry with this many restarts. |
| `progressive?` | `boolean` | Add constraints progressively with short LM solves, all in one WASM call. |
| `timeBudgetMs?` | `number` | Wall-clock time budget in ms for the entire solve. 0 = no limit. |
| `debugConstructiveTranscript?` | `boolean` | Capture a readable constructive transcript in `constraintMeta.debug`. |
| `debugSvgSnapshots?` | `boolean` | Capture SVG snapshots for constructive steps in `constraintMeta.debug`. |

#### `solveConstraintsOnly(options?: SolveOptions): { maxError: number; rejectedCount: number; definition: ConstraintDefinition; }` — Run the solver without building a full `ConstraintSketch`.

Lighter than `solve()` — skips profile and DOF analysis. Useful for lightweight constraint validation or progress monitoring mid-construction.

#### `route(x: number, y: number): RouteBuilder` — Start a directional route from coordinates.

Returns a [`RouteBuilder`](/docs/viewport#routebuilder) - describe the path with up/down/left/right/arcLeft/arcRight. Each method returns the entity ID (`LineId` or `ArcId`) for use in `sk.*` constraints.

```js
const r = sk.route(0, 0);
const stem = r.up(18);
r.arcLeft(8.9);
const neck = r.down();
r.done();
sk.offsetX(stem, neck, 10.8);
```

### `ConstraintSketch`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `constraintMeta` | `SketchConstraintMeta` | — |
| `definition` | `ConstraintDefinition` | — |

**Methods:**

#### `detectArrangement(): Sketch[]` — Enumerate all bounded regions formed by the line arrangement of this sketch. Construction lines are excluded. Regions are returned largest-first by area.

#### `detectArrangementRegion(_seed: Vec2): Sketch` — Select the single arrangement region that contains the given seed point. Throws if no region contains the seed.

#### `toPolyline(samples?: number): Vec2[]` — Return the solved constrained path as a sampled 2D polyline.

Use this when a construction rail was authored with `constrainedSketch()` and should feed another operation such as `Loft.pathOnXz(...)`. The sketch must contain exactly one profile path.

#### `withUpdatedConstraint(constraintId: string, value: number): ConstraintSketch` — Re-solve the sketch after changing the value of one existing constraint.

Use this for interactive dimension edits without rebuilding the whole sketch graph. It attempts a warm-started solve first, then falls back to a full solve if needed.

#### `inspect(): string` — Return a human-readable diagnostic string of the solved state.

### `SketchGroupBuilder`

#### `point(lx: number, ly: number): PointId` — Add a point in local coordinates. Returns its globally-addressable PointId.

#### `line(a: PointId, b: PointId, name?: string): LineId` — Connect two group points with a line. Both must be PointIds from this group.

#### `fixRotation(): this` — Freeze rotation (theta). Group can still translate - 2 DOF remain.

#### `fix(): this` — Freeze all 3 DOF - group is completely fixed.

#### `done(): SketchGroupHandle` — Finalize and register the group with the builder.

### `Point2D`

An immutable 2D point with measurement and construction helpers.

Used as construction geometry in sketches, constraints, and analytic measurements. All methods return new instances — `Point2D` is immutable.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | — |
| `y` | `number` | — |

**Methods:**

#### `distanceTo(other: Point2D): number` — Measure straight-line distance to another point.

#### `midpointTo(other: Point2D): Point2D` — Compute the midpoint between this point and another point.

#### `translate(dx: number, dy: number): Point2D` — Return a point shifted by the given delta.

#### `toTuple(): Vec2` — Convert this point to a plain `[x, y]` tuple.

### `Line2D`

An immutable 2D line segment with length, angle, intersection, and parallel helpers.

Provides both segment-only (`intersectSegment`) and infinite-line (`intersect`) intersection queries. All methods return new instances.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `start` | `Point2D` | — |
| `end` | `Point2D` | — |

**Methods:**

#### `get length(): number` — Length of the line segment.

#### `get midpoint(): Point2D` — Midpoint of the line segment.

#### `get angle(): number` — Direction angle in degrees, measured CCW from +X.

#### `get direction(): Vec2` — Unit direction vector from start to end.

#### `parallel(distance: number): Line2D` — Create a parallel line offset by the given distance.

Positive distance shifts to the left of the line direction.

#### `intersect(other: Line2D): Point2D | null` — Intersect this line with another infinite line.

#### `intersectSegment(other: Line2D): Point2D | null` — Intersect this line with another as bounded segments.

#### `static fromCoordinates(x1: number, y1: number, x2: number, y2: number): Line2D` — Create a line from raw coordinates.

#### `static fromPointAndAngle(origin: Point2D, angleDeg: number, length: number): Line2D` — Create a line from a start point, angle, and length.

#### `static fromPointAndDirection(origin: Point2D, dir: Vec2, length: number): Line2D` — Create a line from a start point, direction vector, and length.

### `Circle2D`

An immutable 2D circle with area, circumference, and extrusion support.

Extruding a `Circle2D` produces a cylinder with named `top`, `bottom`, and `side` faces accessible via the topology API.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `center` | `Point2D` | — |
| `radius` | `number` | — |

**Methods:**

#### `get diameter(): number` — Diameter of the circle.

#### `get circumference(): number` — Circumference of the circle.

#### `get area(): number` — Area of the circle.

#### `pointAtAngle(angleDeg: number): Point2D` — Return a point on the circle at the given angle.

#### `translate(dx: number, dy: number): Circle2D` — Return a translated circle.

#### `toSketch(segments?: number): Sketch` — Convert this circle to a sketch profile.

#### `extrude(height: number, segments?: number): Shape` — Extrude the circle into a solid cylinder.

#### `static fromCenterAndRadius(center: Point2D, radius: number): Circle2D` — Create a circle from its center and radius.

#### `static fromDiameter(center: Point2D, diameter: number): Circle2D` — Create a circle from its center and diameter.

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

Rectangle2D.fromCenterAndDimensions(new Point2D(50, 30), 100, 60);
Rectangle2D.from2Corners(new Point2D(0, 0), new Point2D(100, 60));
Rectangle2D.from3Points(p1, p2, p3);  // free-angle rectangle
```

#### `get width(): number` — Width of the rectangle.

#### `get height(): number` — Height of the rectangle.

#### `get center(): Point2D` — Geometric center of the rectangle.

#### `side(name: RectSide): Line2D` — Return a named side of the rectangle.

#### `sideAt(index: number): Line2D` — Return a side by index.

#### `vertex(name: RectVertex): Point2D` — Return a named vertex of the rectangle.

#### `diagonals(): [ Line2D, Line2D ]` — Return the two diagonals of the rectangle.

#### `toSketch(): Sketch` — Convert the rectangle to a sketch profile.

#### `translate(dx: number, dy: number): Rectangle2D` — Return a translated rectangle.

#### `static fromDimensions(x: number, y: number, width: number, height: number): Rectangle2D` — Create an axis-aligned rectangle from origin corner plus width and height.

#### `static fromCenterAndDimensions(center: Point2D, width: number, height: number): Rectangle2D` — Create a rectangle centered on a point.

#### `static from2Corners(p1: Point2D, p2: Point2D): Rectangle2D` — Create an axis-aligned rectangle from two opposite corners.

#### `static from3Points(p1: Point2D, p2: Point2D, p3: Point2D): Rectangle2D` — Create a free-angle rectangle from three points.

`p1` and `p2` define one edge, and `p3` chooses the perpendicular side.

#### `extrude(height: number, up?: boolean): Shape` — Extrude the rectangle into a solid prism with named topology.

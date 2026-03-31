# Sketch API

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

2D geometry creation, transforms, booleans, constrained sketches, and extrusion.

## Functions

### 2D Sketch Primitives

Create 2D profiles for extrusion and other operations.

#### `path()`

```ts
path(): PathBuilder
```

Create a path builder for constructing 2D outlines.

#### `stroke()`

```ts
stroke(points: [ number, number ][], width: number, join?: "Round" | "Square"): Sketch
```

Create a stroked polyline sketch from an array of 2D points.

#### `rect()`

```ts
rect(width: number, height: number, center?: boolean): Sketch
```

Create a 2D rectangle. When center is true, the origin is at the rectangle center; otherwise at the bottom-left corner.

#### `circle2d()`

```ts
circle2d(radius: number, segments?: number): Sketch
```

Create a 2D circle centered at the origin. Use segments for lower-poly approximations.

#### `roundedRect()`

```ts
roundedRect(width: number, height: number, radius: number, center?: boolean): Sketch
```

Create a 2D rectangle with rounded corners. The radius is clamped to fit within the dimensions.

#### `polygon()`

```ts
polygon(points: ([ number, number ] | Point2D)[]): Sketch
```

Create a 2D polygon from an array of [x, y] points or Point2D objects. Winding is normalized to CCW.

#### `ngon()`

```ts
ngon(sides: number, radius: number): Sketch
```

Create a regular polygon (equilateral triangle, hexagon, etc.) inscribed in a circle of the given radius.

#### `ellipse()`

```ts
ellipse(rx: number, ry: number, segments?: number): Sketch
```

Create a 2D ellipse centered at the origin with the given X and Y radii.

#### `slot()`

```ts
slot(length: number, width: number): Sketch
```

Create a slot (stadium/discorectangle) — a rectangle with semicircular ends, centered at origin.

#### `star()`

```ts
star(points: number, outerR: number, innerR: number): Sketch
```

Create a star shape with alternating outer and inner radii.

### 2D Sketch Booleans

Combine 2D sketches.

#### `union2d()`

```ts
union2d(...inputs: SketchOperandInput[]): Sketch
```

Combine 2D sketches into a single profile (additive boolean). Accepts individual sketches or arrays.

#### `difference2d()`

```ts
difference2d(...inputs: SketchOperandInput[]): Sketch
```

Subtract 2D sketches from a base sketch. The first sketch is the base; all others are subtracted.

#### `intersection2d()`

```ts
intersection2d(...inputs: SketchOperandInput[]): Sketch
```

Keep only the overlapping area of the input sketches (intersection boolean).

### 2D Text

Create text geometry from strings using the built-in geometric font.

#### `text2d()`

```ts
text2d(content: string, options?: TextOptions): Sketch
```

Build a 2-D filled Sketch from a text string. The Sketch origin is at the left end of the text baseline by default (see `align` and `baseline` options to adjust placement). Text is rendered using the bundled Inter font by default, or any TTF/OTF/WOFF font you provide. // Extruded nameplate text2d('FORGE CAD', { size: 8 }).extrude(1.2) // Centered label on the XY plane text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' })

<details><summary><code>TextOptions</code></summary>

```ts
interface TextOptions {
  /** Cap height of the text in model units. All other dimensions (stroke weight, spacing) scale proportionally. */
  size?: number;
  /** Extra space between characters in model units. Negative values tighten the tracking. */
  letterSpacing?: number;
  /** Horizontal alignment relative to x = 0. - `'left'`   — left edge at x = 0 (default) - `'center'` — centred on x = 0 - `'right'`  — right edge at x = 0 */
  align?: "left" | "center" | "right";
  /** Vertical alignment relative to y = 0. - `'baseline'` — y = 0 is the text baseline (bottom of capital letters) - `'center'`   — y = 0 is the vertical midpoint of the cap height - `'top'`      — y = 0 is the top of capital letters */
  baseline?: "baseline" | "center" | "top";
  /** Font to use for text rendering. - `'sans-serif'` or `'inter'` — bundled Inter font (works everywhere, including browser) - **file path** — path to a TTF, OTF, or WOFF font file (CLI/Node only) - **Font object** — a previously loaded opentype.js Font (from `loadFont()`) - **omitted** — uses the bundled Inter font (same as `'sans-serif'`) text2d('Hello World', { size: 10 })                          // default Inter text2d('Custom Font', { size: 10, font: '/path/to/font.ttf' }) */
  font?: string | opentype$1.Font;
  /** Bezier flattening tolerance in model units. Smaller = more polygon segments = smoother curves. */
  flattenTolerance?: number;
}
```

</details>

#### `textWidth()`

```ts
textWidth(content: string, options?: Pick<TextOptions, "size" | "letterSpacing" | "font">): number
```

Returns the rendered width of a string in model units (same options as text2d).

### Constrained Sketches

Build parametric 2D geometry with geometric constraints and a solver.

#### `constrainedSketch()`

```ts
constrainedSketch(options?: ConstrainedSketchOptions): ConstrainedSketchBuilder
```

Build a parametric 2D sketch with geometric constraints solved by the built-in constraint solver.

<details><summary><code>ConstrainedSketchOptions</code></summary>

```ts
interface ConstrainedSketchOptions {
  /** When true, adding a constraint that cannot be satisfied throws instead of silently discarding it. */
  strict?: boolean;
}
```

</details>

#### `addRect()`

```ts
addRect(sk: ConstrainedSketchBuilder, options?: RectOptions): ConstrainedRect
```

Add an axis-aligned rectangle concept to the builder. Creates 4 vertices (CCW: bl→br→tr→tl), 4 sides, applies 4 structural constraints (`horizontal`/`vertical` on each side), enforces CCW winding, registers a loop and a shape, and returns a `ConstrainedRect` handle. ```ts const sk = constrainedSketch(); const rect = addRect(sk, { x: 0, y: 0, width: 100, height: 50 }); sk.fix(rect.bottomLeft, 0, 0); sk.length(rect.bottom, 120); ```

<details><summary><code>RectOptions</code></summary>

```ts
interface RectOptions {
  /** Bottom-left x coordinate. Default: 0. */
  x?: number;
  /** Bottom-left y coordinate. Default: 0. */
  y?: number;
  /** Width (along x). Default: 10. */
  width?: number;
  /** Height (along y). Default: 10. */
  height?: number;
  /** Prevent 180° rotation (ensures bottom edge points rightward). Default: false. */
  blockRotation?: boolean;
}
```

</details>

<details><summary><code>ConstrainedRect</code></summary>

```ts
interface ConstrainedRect {
  bottomLeft: PointId;
  bottomRight: PointId;
  topRight: PointId;
  topLeft: PointId;
  /** bottom-left → bottom-right */
  bottom: LineId;
  /** bottom-right → top-right */
  right: LineId;
  /** top-right → top-left */
  top: LineId;
  /** top-left → bottom-left */
  left: LineId;
  /** Center point constrained to the geometric center via `midpoint` on the diagonal. Can be used in further constraints: `sk.fix(rect.center, 0, 0)`, `sk.coincident(rect.center, other)`. */
  center: PointId;
  /** ShapeId for `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y`. */
  shape: ShapeId;
}
```

</details>

#### `addPolygon()`

```ts
addPolygon(sk: ConstrainedSketchBuilder, options: PolygonOptions): ConstrainedPolygon
```

Add a general polygon concept to the builder. Creates n vertices and n sides (CCW: `sides[i]` from `vertices[i]` → `vertices[(i+1) % n]`). Applies a `ccw` constraint to enforce winding. The user is responsible for all dimensional constraints. ```ts const sk = constrainedSketch(); const tri = addPolygon(sk, { points: [[0,0],[100,0],[50,80]] }); sk.fix(tri.vertex(0), 0, 0); sk.length(tri.side(0), 100); ```

<details><summary><code>PolygonOptions</code></summary>

```ts
interface PolygonOptions {
  /** Whether to register a closed loop for sketch generation. Default: true. */
  addLoop?: boolean;
  /** Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false. */
  blockRotation?: boolean;
}
```

</details>

<details><summary><code>ConstrainedPolygon</code></summary>

```ts
interface ConstrainedPolygon {
  /** CCW-ordered PointIds. */
  vertices: PointId[];
  /** CCW-ordered LineIds. `sides[i]` runs from `vertices[i]` → `vertices[(i+1) % n]`. */
  sides: LineId[];
  /** ShapeId for `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX/Y`. */
  shape: ShapeId;
}
```

</details>

#### `addRegularPolygon()`

```ts
addRegularPolygon(sk: ConstrainedSketchBuilder, options: RegularPolygonOptions): ConstrainedRegularPolygon
```

Add a regular n-gon concept to the builder. Vertices are placed at `(cx + r·cos(startAngle + i·2π/n), cy + r·sin(...))`. Equal-side constraints enforce regularity. The center point is constrained to the centroid via midpoint constraints on the first diagonal. ```ts const sk = constrainedSketch(); const hex = addRegularPolygon(sk, { sides: 6, radius: 25, cx: 0, cy: 0 }); sk.fix(hex.center, 0, 0); sk.length(hex.side(0), 30);  // changes all sides (equal constraint) ```

<details><summary><code>RegularPolygonOptions</code></summary>

```ts
interface RegularPolygonOptions {
  /** Number of sides (minimum 3). */
  sides: number;
  /** Circumradius — distance from center to vertex. Default: 10. */
  radius?: number;
  /** Center x coordinate. Default: 0. */
  cx?: number;
  /** Center y coordinate. Default: 0. */
  cy?: number;
  /** Angle (in degrees) of vertex[0] measured from the +X axis (CCW positive). Default: 0 (rightmost vertex). */
  startAngle?: number;
  /** Prevent 180° rotation (ensures first edge maintains its initial direction). Default: false. */
  blockRotation?: boolean;
}
```

</details>


<details><summary><code>ConstrainedRegularPolygon</code> extends ConstrainedPolygon</summary>

```ts
interface ConstrainedRegularPolygon extends ConstrainedPolygon {
  /** Center point. Use `sk.fix(poly.center, x, y)` to pin location, or `sk.coincident(poly.center, other)` to align with other geometry. */
  center: PointId;
}
```

</details>

### 2D Geometry Helpers

Analytic 2D geometry classes for measurement and construction.

#### `point()`

```ts
point(x: number, y: number): Point2D
```

Create an analytic 2D point for measurement and construction geometry.

#### `line()`

```ts
line(x1: number, y1: number, x2: number, y2: number): Line2D
```

Create an analytic 2D line segment between two points. Provides length, midpoint, angle, intersection, and parallel helpers.

#### `circle()`

```ts
circle(cx: number, cy: number, radius: number): Circle2D
```

Create an analytic 2D circle for measurement, construction, and extrusion. Provides diameter, circumference, area, and toSketch().

#### `rectangle()`

```ts
rectangle(x: number, y: number, width: number, height: number): Rectangle2D
```

Create an analytic 2D rectangle with named sides and vertices. Provides side(), vertex(), contains(), toSketch(), and extrude().

#### `degrees()`

```ts
degrees(deg: number): number
```

Convert degrees to degrees (identity — for readability in scripts)

#### `radians()`

```ts
radians(rad: number): number
```

Convert radians to degrees

---

## Classes

### `Sketch`

2D profile for extrusion, revolve, and other operations. Supports transforms (translate, rotate, scale, mirror), booleans (add, subtract, intersect), offset, simplify, warp, extrude, revolve, and queries (area, bounds, isEmpty, numVert). All operations are immutable and return new sketches.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `cross` | `ProfileBackend` | — |

**Methods:**

- `color()` — Set the color of this sketch (hex string, e.g. "#ff0000")
- `clone()` — Return a new Sketch wrapper for explicit duplication in scripts.
- `duplicate()` — Alias for clone()
- `area()` — Area in mm squared.
- `bounds()` — Bounding box as { min: [x,y], max: [x,y] }.
- `isEmpty()` — True if the sketch contains no area.
- `numVert()` — Vertex count of the polygon representation.
- `toPolygons()` — toPolygons(): number[][][]
- `translate()` — translate(_x: number, _y?: number): Sketch
- `rotate()` — rotate(_degrees: number): Sketch
- `rotateAround()` — rotateAround(_degrees: number, _pivot: [ number, number ]): Sketch
- `scale()` — scale(_v: number | [ number, number ]): Sketch
- `mirror()` — mirror(_ax: [ number, number ]): Sketch
- `add()` — add(..._others: SketchOperandInput[]): Sketch
- `subtract()` — subtract(..._others: SketchOperandInput[]): Sketch
- `intersect()` — intersect(..._others: SketchOperandInput[]): Sketch
- `offset()` — offset(_delta: number, _join?: "Square" | "Round" | "Miter"): Sketch
- `regions()` — Decompose this sketch into its distinct filled regions. See `sketchRegions()`. Regions are returned largest-first by area.
- `region()` — Select the single filled region that contains the given 2D seed point. Throws if the seed is outside all regions. See `sketchRegion()`.
- `extrude()` — Extrude this 2D sketch along Z to create a 3D solid. Supports twist, scale tapering, and centering.
- `revolve()` — Revolve this 2D sketch around the Y axis to create a 3D solid of revolution.
- `attachTo()` — attachTo(_target: Sketch, _targetAnchor: Anchor, _selfAnchor?: Anchor, _offset?:
- `onFace()` — onFace(_parentOrFace: Shape | { toShape(): Shape; } | { _bbox(): { min: number[]

### `ConstrainedSketchBuilder`

**Methods:**

- `moveTo()` — moveTo(x: number, y: number): this
- `lineTo()` — lineTo(x: number, y: number): this
- `lineH()` — lineH(dx: number): this
- `lineV()` — lineV(dy: number): this
- `lineAngled()` — lineAngled(length: number, degrees: number): this
- `arcTo()` — arcTo(x: number, y: number, radius: number, clockwise?: boolean): this
- `arcByCenter()` — arcByCenter(centerId: PointId, startId: PointId, endId: PointId, clockwise?: boo
- `bezier()` — bezier(p0: any, p1: any, p2: any, p3: any, name?: string): BezierId
- `bezierTo()` — bezierTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number)
- `blendTo()` — blendTo(x: number, y: number, weight?: number): this
- `close()` — close(): this
- `addLoopCircle()` — addLoopCircle(center: PointId, radius: number, segments?: number): this
- `addLoop()` — addLoop(points: any[]): this
- `addProfileLoop()` — addProfileLoop(segments: Array<{ kind: "line"; line: any; } | { kind: "arc"; arc
- `horizontal()` — horizontal(line: any): this
- `vertical()` — vertical(line: any): this
- `parallel()` — parallel(a: any, b: any): this
- `sameDirection()` — sameDirection(a: any, b: any): this
- `oppositeDirection()` — oppositeDirection(a: any, b: any): this
- `blockRotation()` — blockRotation(points: any[], axis?: "x" | "y"): this
- `perpendicular()` — perpendicular(a: any, b: any): this
- `tangent()` — tangent(a: any, b: any): this
- `equal()` — equal(a: any, b: any): this
- `coincident()` — coincident(a: any, b: any): this
- `concentric()` — concentric(a: any, b: any): this
- `collinear()` — collinear(point: any, line: any): this
- `symmetric()` — symmetric(a: any, b: any, axis: any): this
- `fix()` — fix(point: any, x?: number, y?: number): this
- `midpoint()` — midpoint(point: any, line: any): this
- `pointOnCircle()` — pointOnCircle(point: any, circle: any): this
- `pointOnLine()` — pointOnLine(point: any, line: any): this
- `distance()` — distance(a: any, b: any, value: number): this
- `length()` — length(line: any, value: number): this
- `angle()` — angle(a: any, b: any, value: number): this
- `radius()` — radius(circle: any, value: number): this
- `diameter()` — diameter(circle: any, value: number): this
- `hDistance()` — hDistance(a: any, b: any, value: number): this
- `vDistance()` — vDistance(a: any, b: any, value: number): this
- `pointLineDistance()` — pointLineDistance(point: any, line: any, value: number): this
- `lineDistance()` — lineDistance(a: any, b: any, value: number): this
- `absoluteAngle()` — absoluteAngle(line: any, value: number): this
- `equalRadius()` — equalRadius(a: any, b: any): this
- `arcLength()` — arcLength(arc: any, value: number): this
- `lineTangentArc()` — lineTangentArc(line: any, arc: any, atStart: boolean): this
- `arcTangentArc()` — arcTangentArc(arcA: any, arcB: any, aAtStart?: boolean, bAtStart?: boolean): thi
- `bezierTangentArc()` — bezierTangentArc(bezier: any, arc: any, atBezierStart: boolean, atArcStart: bool
- `smoothBlend()` — smoothBlend(arc1: any, arc2: any, options?: { weight?: number; arc1End?: "start"
- `shapeWidth()` — shapeWidth(shape: any, value: number): this
- `shapeHeight()` — shapeHeight(shape: any, value: number): this
- `shapeCentroidX()` — shapeCentroidX(shape: any, value: number): this
- `shapeCentroidY()` — shapeCentroidY(shape: any, value: number): this
- `shapeArea()` — shapeArea(shape: any, value: number): this
- `shapeEqualCentroid()` — shapeEqualCentroid(a: any, b: any): this
- `angleBetween()` — angleBetween(a: any, b: any, value: number): this
- `ccw()` — ccw(...points: any[]): this
- `importPoint()` — importPoint(pt: { x: number; y: number; }, fixed?: boolean): PointId
- `importLine()` — importLine(l: { start: { x: number; y: number; }; end: { x: number; y: number; }
- `importRectangle()` — importRectangle(r: { vertices: [ { x: number; y: number; }, { x: number; y: numb
- `referencePoint()` — referencePoint(x: number, y: number): PointId
- `referenceLine()` — referenceLine(x1: number, y1: number, x2: number, y2: number): LineId
- `referenceFrom()` — referenceFrom(source: ConstraintSketch, entityId: string): PointId | LineId | nu
- `referenceAllFrom()` — referenceAllFrom(source: ConstraintSketch): { points: Map<string, PointId>; line
- `route()` — Route a profile through a sequence of geometric elements. The solver computes all tangent points and intersections automatically. Steps can include: - `{ point: [x, y] }` — route through a point - `{ axis: 'x'|'y', offset: n }` — follow a construction line - `{ line: {...}, until: n }` — follow a line clipped to a coordinate - `{ tangent: { center, radius } }` — tangent arc onto a construction circle - `{ fillet: radius }` — fillet between adjacent elements - `{ tangentArc: radius }` — free tangent arc (solver finds center) Returns `this` for chaining. Call `.solve()` after to get the Sketch.
- `point()` — point(x?: number, y?: number, fixed?: boolean): PointId
- `pointAt()` — pointAt(index: number): PointId
- `line()` — line(a: PointId, b: PointId, construction?: boolean, name?: string): LineId
- `lineAt()` — lineAt(index: number): LineId
- `circle()` — circle(center: PointId, radius: number, construction?: boolean, segments?: numbe
- `circleAt()` — circleAt(index: number): CircleId
- `shape()` — Register a named shape (closed polygon) from an ordered list of line IDs. Returns the ShapeId for use in shape constraints (shapeWidth, shapeCentroidX, etc.).
- `group()` — Create a rigid-body group with a local coordinate frame. Points/lines added to the group move together as a unit — the solver sees 3 DOF (x, y, θ) instead of 2N per point. ```ts const g = sk.group({ x: 50, y: 30 }); const p0 = g.point(0, 0);    // local origin → world (50, 30) const p1 = g.point(100, 0);  // local (100,0) → world (150, 30) const l = g.line(p0, p1); g.fixRotation(); // p0, p1 work in constraints like any other PointId: sk.coincident(p0, someExternalPoint); ```
- `constrain()` — constrain(constraint: Omit<SketchConstraint, "id">): this
- `solve()` — solve(options?: SolveOptions): ConstraintSketch
- `solveConstraintsOnly()` — Run the solver without building a full `ConstraintSketch`. Useful for lightweight constraint validation or progress monitoring. Returns the final maxError, the number of rejected constraints, and the solved `ConstraintDefinition` with updated point positions.
- `rect()` — Add an axis-aligned rectangle concept. Returns a `ConstrainedRect` handle with named vertices, sides, and center.
- `addPolygon()` — Add a general polygon concept (CCW winding enforced). Returns a `ConstrainedPolygon` handle.
- `regularPolygon()` — Add a regular n-gon concept (equal sides, CCW winding). Returns a `ConstrainedRegularPolygon` handle with a center point.
- `groupRect()` — Add a rigid rectangle as a group concept. Returns a `ConstrainedGroupRect` handle with named vertices and sides. The rectangle is fixed in shape — only position (and optionally rotation) varies.

### `ConstraintSketch`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `constraintMeta` | `SketchConstraintMeta` | — |
| `definition` | `ConstraintDefinition` | — |

**Methods:**

- `detectArrangement()` — Enumerate all bounded regions formed by the line arrangement of this sketch. Construction lines are excluded. Regions are returned largest-first by area.
- `detectArrangementRegion()` — Select the single arrangement region that contains the given seed point. Throws if no region contains the seed.
- `withUpdatedConstraint()` — withUpdatedConstraint(constraintId: string, value: number): ConstraintSketch
- `inspect()` — Return a human-readable diagnostic string of the solved state.

### `SketchGroupBuilder`

**Methods:**

- `point()` — Add a point in local coordinates. Returns its globally-addressable PointId.
- `line()` — Connect two group points with a line. Both must be PointIds from this group.
- `fixRotation()` — Freeze rotation (θ). Group can still translate — 2 DOF remain.
- `fix()` — Freeze all 3 DOF — group is completely fixed.
- `done()` — Finalize and register the group with the builder. Returns a handle for referencing group points/lines in constraints.

### `Point2D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | — |
| `y` | `number` | — |

**Methods:**

- `distanceTo()` — distanceTo(other: Point2D): number
- `midpointTo()` — midpointTo(other: Point2D): Point2D
- `translate()` — translate(dx: number, dy: number): Point2D
- `toTuple()` — toTuple(): [ number, number ]

### `Line2D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `start` | `Point2D` | — |
| `end` | `Point2D` | — |

**Methods:**

- `get length()` — get length(): number
- `get midpoint()` — get midpoint(): Point2D
- `get angle()` — get angle(): number
- `get direction()` — get direction(): [ number, number ]
- `parallel()` — Create a line parallel to this one, offset by distance. positive = left of direction
- `intersect()` — Intersection point of two lines (treating them as infinite lines). Returns null if lines are parallel.
- `intersectSegment()` — Intersection point within both line segments only. Returns null if segments don't cross.
- `static fromCoordinates()` — static fromCoordinates(x1: number, y1: number, x2: number, y2: number): Line2D
- `static fromPointAndAngle()` — static fromPointAndAngle(origin: Point2D, angleDeg: number, length: number): Lin
- `static fromPointAndDirection()` — static fromPointAndDirection(origin: Point2D, dir: [ number, number ], length: n

### `Circle2D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `center` | `Point2D` | — |
| `radius` | `number` | — |

**Methods:**

- `get diameter()` — get diameter(): number
- `get circumference()` — get circumference(): number
- `get area()` — get area(): number
- `pointAtAngle()` — Point on the circle at given angle (degrees, 0=right, CCW)
- `translate()` — translate(dx: number, dy: number): Circle2D
- `toSketch()` — toSketch(segments?: number): Sketch
- `extrude()` — Extrude to TrackedShape with top/bottom/side faces
- `static fromCenterAndRadius()` — static fromCenterAndRadius(center: Point2D, radius: number): Circle2D
- `static fromDiameter()` — static fromDiameter(center: Point2D, diameter: number): Circle2D

### `Rectangle2D`

A rectangle with named sides and vertices. Sides are named based on the rectangle's local orientation at construction time. Vertices go: bottom-left, bottom-right, top-right, top-left (CCW from bottom-left).

**Methods:**

- `get width()` — get width(): number
- `get height()` — get height(): number
- `get center()` — get center(): Point2D
- `side()` — side(name: RectSide): Line2D
- `sideAt()` — Get side by index (0=bottom, 1=right, 2=top, 3=left)
- `vertex()` — vertex(name: RectVertex): Point2D
- `diagonals()` — Get the two diagonals of this rectangle
- `toSketch()` — toSketch(): Sketch
- `translate()` — translate(dx: number, dy: number): Rectangle2D
- `static fromDimensions()` — Create from origin corner + width/height (axis-aligned)
- `static fromCenterAndDimensions()` — Create centered at a point
- `static from2Corners()` — Create from two opposite corners (axis-aligned)
- `static from3Points()` — Create from three points (free angle). p1-p2 defines one side, p3 gives the height direction.
- `extrude()` — Extrude this rectangle into a 3D TrackedShape with named faces and edges

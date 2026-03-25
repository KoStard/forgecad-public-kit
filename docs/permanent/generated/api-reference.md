# ForgeCAD API Reference

> **Auto-generated** from `src/forge/forge-public-api.ts`.
> Do not edit by hand — run `npm run gen:docs` to regenerate.
>
> For detailed guides, examples, and explanations see the hand-written docs in `docs/permanent/api/`.

## Table of Contents

**Functions:**
- [3D Primitives](#3d-primitives) — `box`, `cylinder`, `sphere`, `hull3d`, `levelSet`
- [Boolean Operations](#boolean-operations) — `union`, `difference`, `intersection`
- [2D Sketch Primitives](#2d-sketch-primitives) — `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`, `path`, `stroke`
- [2D Sketch Booleans](#2d-sketch-booleans) — `union2d`, `difference2d`, `intersection2d`, `hull2d`
- [2D Text](#2d-text) — `text2d`, `textWidth`
- [Constrained Sketches](#constrained-sketches) — `constrainedSketch`, `addRect`, `addPolygon`, `addRegularPolygon`
- [2D Geometry Helpers](#2d-geometry-helpers) — `point`, `line`, `circle`, `rectangle`, `degrees`, `radians`
- [Curves & Surfacing](#curves-surfacing) — `spline2d`, `spline3d`, `loft`, `sweep`
- [Patterns & Topology](#patterns-topology) — `linearPattern`, `circularPattern`, `mirrorCopy`, `filletEdge`, `chamferEdge`, `filletCorners`, `arcBridgeBetweenRects`
- [Imports & Composition](#imports-composition) — `importSketch`, `importPart`, `importGroup`, `importAssembly`, `importSvgSketch`
- [Parameters](#parameters) — `param`, `boolParam`
- [Grouping](#grouping) — `group`
- [Assembly & Joints](#assembly-joints) — `bomToCsv`, `assembly`, `joint`
- [Sheet Metal](#sheet-metal) — `sheetMetal`
- [Section & Projection](#section-projection) — `intersectWithPlane`, `projectToPlane`
- [Viewport & Runtime](#viewport-runtime) — `cutPlane`, `cutPlane`, `explodeView`, `jointsView`, `viewConfig`, `scene`
- [Annotations & Output](#annotations-output) — `dim`, `dimLine`, `bom`, `robotExport`
- [Fasteners & Hardware](#fasteners-hardware) — `boltHole`, `fastenerHole`, `counterbore`, `hexNut`, `holePattern`, `thread`, `bolt`, `nut`, `washer`, `fastenerSet`
- [Structural Profiles](#structural-profiles) — `tSlotProfile`, `tSlotExtrusion`, `profile2020BSlot6Profile`, `profile2020BSlot6`
- [Pipes & Routing](#pipes-routing) — `tube`, `pipe`, `pipeRoute`, `elbow`
- [Gears](#gears) — `spurGear`, `sideGear`, `faceGear`, `ringGear`, `rackGear`, `bevelGear`, `gearPair`, `bevelGearPair`, `sideGearPair`, `faceGearPair`
- [Utility Shapes](#utility-shapes) — `roundedBox`, `bracket`, `explode`
- [Other](#other) — `composeChain`, `highlight`

**Classes:**
- [`Transform`](#transform)
- [`Sketch`](#sketch)
- [`ConstraintSketch`](#constraintsketch)
- [`ConstrainedSketchBuilder`](#constrainedsketchbuilder)
- [`Point2D`](#point2d)
- [`Line2D`](#line2d)
- [`Circle2D`](#circle2d)
- [`Rectangle2D`](#rectangle2d)
- [`TrackedShape`](#trackedshape)
- [`PathBuilder`](#pathbuilder)
- [`Curve3D`](#curve3d)
- [`Shape`](#shape)
- [`ShapeGroup`](#shapegroup)
- [`SolvedAssembly`](#solvedassembly)
- [`Assembly`](#assembly)
- [`ImportedAssembly`](#importedassembly)
- [`SheetMetalPart`](#sheetmetalpart)

**Constants:**
- [`Constraint`](#constraint)
- [`SHEET_METAL_EDGES`](#sheet_metal_edges)
- [`ANCHOR3D_NAMES`](#anchor3d_names)
- [`verify`](#verify)
- [`partLibrary`](#partlibrary)

---

## Functions

### 3D Primitives

Create basic 3D shapes.

#### `box()`

```ts
box(x: number, y: number, z: number, center?: boolean): TrackedShape
```

#### `cylinder()`

```ts
cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape
```

#### `sphere()`

```ts
sphere(radius: number, segments?: number): Shape
```

#### `hull3d()`

```ts
hull3d(...args: (Shape | TrackedShape | [ number, number, number ])[]): Shape
```

#### `levelSet()`

```ts
levelSet(sdf: (p: [ number, number, number ]) => number, bounds: { min: [ number, number, number ]; max: [ number, number, number ]; }, edgeLength: number, level?: number): Shape
```

### Boolean Operations

Combine shapes using set operations.

#### `union()`

```ts
union(...shapes: (_ShapeOperand | _ShapeOperand[])[]): Shape
```

#### `difference()`

```ts
difference(...shapes: (_ShapeOperand | _ShapeOperand[])[]): Shape
```

#### `intersection()`

```ts
intersection(...shapes: (_ShapeOperand | _ShapeOperand[])[]): Shape
```

### 2D Sketch Primitives

Create 2D profiles for extrusion and other operations.

#### `rect()`

```ts
rect(width: number, height: number, center?: boolean): Sketch
```

#### `circle2d()`

```ts
circle2d(radius: number, segments?: number): Sketch
```

#### `roundedRect()`

```ts
roundedRect(width: number, height: number, radius: number, center?: boolean): Sketch
```

#### `polygon()`

```ts
polygon(points: ([ number, number ] | Point2D)[]): Sketch
```

#### `ngon()`

```ts
ngon(sides: number, radius: number): Sketch
```

#### `ellipse()`

```ts
ellipse(rx: number, ry: number, segments?: number): Sketch
```

#### `slot()`

```ts
slot(length: number, width: number): Sketch
```

#### `star()`

```ts
star(points: number, outerR: number, innerR: number): Sketch
```

#### `path()`

```ts
path(): PathBuilder
```

#### `stroke()`

```ts
stroke(points: [ number, number ][], width: number, join?: "Round" | "Square"): Sketch
```

### 2D Sketch Booleans

Combine 2D sketches.

#### `union2d()`

```ts
union2d(...inputs: SketchOperandInput[]): Sketch
```

#### `difference2d()`

```ts
difference2d(...inputs: SketchOperandInput[]): Sketch
```

#### `intersection2d()`

```ts
intersection2d(...inputs: SketchOperandInput[]): Sketch
```

#### `hull2d()`

```ts
hull2d(...inputs: SketchOperandInput[]): Sketch
```

### 2D Text

Create text geometry from strings using the built-in geometric font.

#### `text2d()`

```ts
text2d(content: string, options?: TextOptions): Sketch
```

Build a 2-D filled Sketch from a text string. The Sketch origin is at the left end of the text baseline by default (see `align` and `baseline` options to adjust placement).  All characters are drawn using the built-in "Forge Mono" geometric font — a clean, angular, monoline typeface designed to extrude and engrave crisply. // Extruded nameplate text2d('FORGE CAD', { size: 8 }).extrude(1.2) // Centered label on the XY plane text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' })

#### `textWidth()`

```ts
textWidth(content: string, options?: Pick<TextOptions, "size" | "letterSpacing">): number
```

Returns the rendered width of a string in model units (same options as text2d).

### Constrained Sketches

Build parametric 2D geometry with geometric constraints and a solver.

#### `constrainedSketch()`

```ts
constrainedSketch(options?: ConstrainedSketchOptions): ConstrainedSketchBuilder
```

#### `addRect()`

```ts
addRect(sk: ConstrainedSketchBuilder, options?: RectOptions): ConstrainedRect
```

Add an axis-aligned rectangle concept to the builder. Creates 4 vertices (CCW: bl→br→tr→tl), 4 sides, applies 4 structural constraints (`horizontal`/`vertical` on each side), registers a loop and a shape, and returns a `ConstrainedRect` handle. ```ts const sk = constrainedSketch(); const rect = addRect(sk, { x: 0, y: 0, width: 100, height: 50 }); sk.fix(rect.bottomLeft, 0, 0); sk.length(rect.bottom, 120); ```

#### `addPolygon()`

```ts
addPolygon(sk: ConstrainedSketchBuilder, options: PolygonOptions): ConstrainedPolygon
```

Add a general polygon concept to the builder. Creates n vertices and n sides (CCW: `sides[i]` from `vertices[i]` → `vertices[(i+1) % n]`). Applies a `ccw` constraint to enforce winding. The user is responsible for all dimensional constraints. ```ts const sk = constrainedSketch(); const tri = addPolygon(sk, { points: [[0,0],[100,0],[50,80]] }); sk.fix(tri.vertex(0), 0, 0); sk.length(tri.side(0), 100); ```

#### `addRegularPolygon()`

```ts
addRegularPolygon(sk: ConstrainedSketchBuilder, options: RegularPolygonOptions): ConstrainedRegularPolygon
```

Add a regular n-gon concept to the builder. Vertices are placed at `(cx + r·cos(startAngle + i·2π/n), cy + r·sin(...))`. Equal-side constraints enforce regularity. The center point is constrained to the centroid via midpoint constraints on the first diagonal. ```ts const sk = constrainedSketch(); const hex = addRegularPolygon(sk, { sides: 6, radius: 25, cx: 0, cy: 0 }); sk.fix(hex.center, 0, 0); sk.length(hex.side(0), 30);  // changes all sides (equal constraint) ```

### 2D Geometry Helpers

Analytic 2D geometry classes for measurement and construction.

#### `point()`

```ts
point(x: number, y: number): Point2D
```

#### `line()`

```ts
line(x1: number, y1: number, x2: number, y2: number): Line2D
```

#### `circle()`

```ts
circle(cx: number, cy: number, radius: number): Circle2D
```

#### `rectangle()`

```ts
rectangle(x: number, y: number, width: number, height: number): Rectangle2D
```

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

### Curves & Surfacing

Create smooth curves, lofted surfaces, and swept solids.

#### `spline2d()`

```ts
spline2d(points: Vec2[], options?: Spline2DOptions): Sketch
```

Create a smooth 2D spline sketch from control points. - Closed spline returns a filled profile. - Open spline requires strokeWidth to return a solid sketch.

#### `spline3d()`

```ts
spline3d(points: Vec3$2[], options?: Spline3DOptions): Curve3D
```

Create a reusable 3D spline curve object.

#### `loft()`

```ts
loft(profiles: Sketch[], heights: number[], options?: LoftOptions): Shape
```

Loft between sketches along Z stations. Profiles can differ in topology/vertex count: interpolation is done on signed-distance fields and meshed with level-set extraction.

#### `sweep()`

```ts
sweep(profile: Sketch, path: Curve3D | Vec3$2[], options?: SweepOptions): Shape
```

Sweep a 2D profile along a 3D path. Path can be: - `Curve3D` from spline3d(...) - array of [x,y,z] points (polyline) The profile is interpreted in the local frame normal plane (x,y axes).

### Patterns & Topology

Repeat, mirror, fillet, and chamfer geometry.

#### `linearPattern()`

```ts
linearPattern(shape: ShapeArg, count: number, dx: number, dy: number, dz?: number): Shape
```

Repeat a shape along a direction vector

#### `circularPattern()`

```ts
circularPattern(shape: ShapeArg, count: number, centerX?: number, centerY?: number): Shape
```

Repeat a shape around the Z axis

#### `mirrorCopy()`

```ts
mirrorCopy(shape: ShapeArg, normal: [ number, number, number ]): Shape
```

Mirror a shape and union with original

#### `filletEdge()`

```ts
filletEdge(shape: ShapeArg$1, edge: EdgeRef, radius: number, quadrant?: [ number, number ], segments?: number): Shape
```

#### `chamferEdge()`

```ts
chamferEdge(shape: ShapeArg$1, edge: EdgeRef, size: number, quadrant?: [ number, number ]): Shape
```

#### `filletCorners()`

```ts
filletCorners(points: PointInput[], corners: FilletCornerSpec[]): Sketch
```

#### `arcBridgeBetweenRects()`

```ts
arcBridgeBetweenRects(rectA: RectAreaArg, rectB: RectAreaArg, segments?: number): Shape
```

Build an arc bridge between two rectangular areas.

### Imports & Composition

Import parts, sketches, and assemblies from other files.

#### `importSketch()`

```ts
importSketch(fileName: string, paramOverrides?: Record<string, number> | SvgImportOptions): Sketch
```

#### `importPart()`

```ts
importPart(fileName: string, paramOverrides?: Record<string, number>): Shape
```

#### `importGroup()`

```ts
importGroup(fileName: string, paramOverrides?: Record<string, number>): ShapeGroup
```

#### `importAssembly()`

```ts
importAssembly(fileName: string, paramOverrides?: Record<string, number>): ImportedAssembly
```

#### `importSvgSketch()`

```ts
importSvgSketch(fileName: string, options?: SvgImportOptions): Sketch
```

### Parameters

Declare user-adjustable parameters with UI controls.

#### `param()`

```ts
param(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean; }): number
```

Declare a parameter. Returns the current value (default or overridden). Each call registers the param for UI generation.

#### `boolParam()`

```ts
boolParam(name: string, defaultValue: boolean): boolean
```

Declare a boolean parameter. Returns the current boolean value. Renders as a checkbox in the UI.

### Grouping

Organize multiple shapes into named groups.

#### `group()`

```ts
group(...items: GroupInput[]): ShapeGroup
```

### Assembly & Joints

Build kinematic assemblies with joints and couplings.

#### `bomToCsv()`

```ts
bomToCsv(rows: BomRow[]): string
```

#### `assembly()`

```ts
assembly(name?: string): Assembly
```

#### `joint()`

```ts
joint(name: string, shape: Shape, pivot: [ number, number, number ], opts?: RevoluteJointOpts): Shape
```

Create a revolute (hinge) joint. Auto-creates a param slider and rotates the shape.

### Sheet Metal

Create folded sheet metal parts with flanges and flat patterns.

#### `sheetMetal()`

```ts
sheetMetal(options: SheetMetalOptions): SheetMetalPart
```

### Section & Projection

Slice or project 3D shapes to 2D.

#### `intersectWithPlane()`

```ts
intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch
```

#### `projectToPlane()`

```ts
projectToPlane(shape: Shape, plane: PlaneSpec): Sketch
```

### Viewport & Runtime

Configure viewport behavior: cut planes, exploded views, joint controls.

#### `cutPlane()`

```ts
cutPlane(name: string, normal: [ number, number, number ], offset?: number, options?: CutPlaneOptions): void
```

Define a named section/cut plane. Appears as a toggle in the View Panel. When enabled, geometry on the positive side of the plane is clipped away.

#### `cutPlane()`

```ts
cutPlane(name: string, normal: [ number, number, number ], options?: CutPlaneOptions): void
```

#### `explodeView()`

```ts
explodeView(options?: ExplodeViewOptions): void
```

Configure viewport exploded-view behavior for the current script execution. Multiple calls merge; later values override earlier ones.

#### `jointsView()`

```ts
jointsView(options?: JointsViewOptions): void
```

Configure runtime joint controls that animate object transforms in the viewport without re-running the script.

#### `viewConfig()`

```ts
viewConfig(options?: ViewConfigOptions): void
```

Configure runtime viewport visuals for the current script execution. Multiple calls merge; later values override earlier ones.

#### `scene()`

```ts
scene(options: SceneOptions): void
```

Configure the scene environment for the current script execution. Controls camera, lighting, background, fog, and post-processing. Multiple calls merge; later values override earlier ones.

### Annotations & Output

Add dimensions, BOM entries, verification checks, and robot export.

#### `dim()`

```ts
dim(from: PointArg$1, to: PointArg$1, opts?: DimOpts): void
```

Add a dimension annotation between two points.

#### `dimLine()`

```ts
dimLine(l: Line2D, opts?: DimOpts): void
```

Add a dimension annotation along a Line2D.

#### `bom()`

```ts
bom(quantity: number, description: string, opts?: BomOpts): void
```

Add a bill-of-materials entry.

#### `robotExport()`

```ts
robotExport(options: RobotExportOptions): CollectedRobotExport
```

### Fasteners & Hardware

Pre-built fastener shapes and hole helpers. Also available via `lib.*`.

#### `boltHole()`

```ts
boltHole(diameter: number, depth: number): Shape
```

#### `fastenerHole()`

```ts
fastenerHole(opts: FastenerHoleOptions): Shape
```

#### `counterbore()`

```ts
counterbore(holeDia: number, boreDia: number, boreDepth: number, totalDepth: number): Shape
```

#### `hexNut()`

```ts
hexNut(acrossFlats: number, height: number, holeDia: number): Shape
```

#### `holePattern()`

```ts
holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape
```

#### `thread()`

```ts
thread(diameter: number, pitch: number, length: number, options?: { depth?: number; segments?: number; }): Shape
```

#### `bolt()`

```ts
bolt(diameter: number, length: number, options?: { ... }): Shape
```

#### `nut()`

```ts
nut(diameter: number, options?: { pitch?: number; height?: number; acrossFlats?: number; segments?: number; }): Shape
```

#### `washer()`

```ts
washer(size: MetricSize, options?: { standard?: WasherStandard; segments?: number; }): Shape
```

#### `fastenerSet()`

```ts
fastenerSet(size: MetricSize, boltLength: number, options?: FastenerSetOptions): FastenerSetResult
```

### Structural Profiles

Extrusion profiles for aluminum framing and similar applications.

#### `tSlotProfile()`

```ts
tSlotProfile(options?: TSlotProfileOptions): Sketch
```

#### `tSlotExtrusion()`

```ts
tSlotExtrusion(length: number, options?: TSlotExtrusionOptions): Shape
```

#### `profile2020BSlot6Profile()`

```ts
profile2020BSlot6Profile(options?: Profile2020BSlot6ProfileOptions): Sketch
```

#### `profile2020BSlot6()`

```ts
profile2020BSlot6(length: number, options?: Profile2020BSlot6Options): Shape
```

### Pipes & Routing

Create pipe runs, elbows, and tubes.

#### `tube()`

```ts
tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape
```

#### `pipe()`

```ts
pipe(height: number, outerRadius: number, wall: number, segments?: number): Shape
```

#### `pipeRoute()`

```ts
pipeRoute(points: [ number, number, number ][], radius: number, options?: { bendRadius?: number; wall?: number; segments?: number; }): Shape
```

#### `elbow()`

```ts
elbow(pipeRadius: number, bendRadius: number, angle?: number | { ... }, options?: { ... }): Shape
```

### Gears

Parametric gear geometry with meshing analysis.

#### `spurGear()`

```ts
spurGear(options: SpurGearOptions): Shape
```

#### `sideGear()`

```ts
sideGear(options: SideGearOptions): Shape
```

#### `faceGear()`

```ts
faceGear(options: FaceGearOptions): Shape
```

#### `ringGear()`

```ts
ringGear(options: RingGearOptions): Shape
```

#### `rackGear()`

```ts
rackGear(options: RackGearOptions): Shape
```

#### `bevelGear()`

```ts
bevelGear(options: BevelGearOptions): Shape
```

#### `gearPair()`

```ts
gearPair(options: GearPairOptions): GearPairResult
```

#### `bevelGearPair()`

```ts
bevelGearPair(options: BevelGearPairOptions): BevelGearPairResult
```

#### `sideGearPair()`

```ts
sideGearPair(options: SideGearPairOptions): SideGearPairResult
```

#### `faceGearPair()`

```ts
faceGearPair(options: FaceGearPairOptions): FaceGearPairResult
```

### Utility Shapes

Pre-built parametric shapes for common patterns.

#### `roundedBox()`

```ts
roundedBox(x: number, y: number, z: number, radius: number): Shape
```

#### `bracket()`

```ts
bracket(width: number, height: number, depth: number, thick: number, holeDia?: number): Shape
```

#### `explode()`

```ts
explode<T extends ExplodeItem[] | ShapeGroup>(items: T, options?: ExplodeOptions): T
```

### Other

#### `composeChain()`

```ts
composeChain(...steps: TransformInput[]): Transform
```

Compose transforms in chain order. Equivalent to Transform.identity().mul(a).mul(b).mul(c)...

#### `highlight()`

```ts
highlight(entityId: string, opts?: { color?: string; label?: string; pulse?: boolean }): void
```

Mark an entity for visual highlighting in the viewport (debugging aid).

---

## Classes

### `Transform`

**Methods:**

- `static identity()` — static identity(): Transform
- `static from()` — static from(input: TransformInput): Transform
- `static translation()` — static translation(x: number, y: number, z: number): Transform
- `static scale()` — static scale(v: number | Vec3): Transform
- `static rotationAxis()` — static rotationAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform
- `static rotateAroundTo()` — static rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: Vec3, targetPoint: V
- `mul()` — Compose transforms in chain order. `a.mul(b)` means apply `a`, then `b`.
- `translate()` — translate(x: number, y: number, z: number): Transform
- `rotateAxis()` — rotateAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform
- `inverse()` — inverse(): Transform
- `point()` — point(p: Vec3): Vec3
- `vector()` — vector(v: Vec3): Vec3
- `toArray()` — toArray(): Mat4

### `Sketch`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `cross` | `ProfileBackend` | — |

**Methods:**

- `color()` — Set the color of this sketch (hex string, e.g. "#ff0000")
- `clone()` — Return a new Sketch wrapper for explicit duplication in scripts.
- `duplicate()` — Alias for clone()
- `area()` — area(): number
- `bounds()` — bounds(): unknown
- `isEmpty()` — isEmpty(): boolean
- `numVert()` — numVert(): number
- `toPolygons()` — toPolygons(): unknown[]
- `translate()` — translate(x: number, y?: number): Sketch
- `rotate()` — rotate(degrees: number): Sketch
- `rotateAround()` — rotateAround(degrees: number, pivot: [ number, number ]): Sketch
- `scale()` — scale(v: number | [ number, number ]): Sketch
- `mirror()` — mirror(ax: [ number, number ]): Sketch
- `add()` — add(...others: SketchOperandInput[]): Sketch
- `subtract()` — subtract(...others: SketchOperandInput[]): Sketch
- `intersect()` — intersect(...others: SketchOperandInput[]): Sketch
- `offset()` — offset(delta: number, join?: "Square" | "Round" | "Miter"): Sketch
- `hull()` — hull(): Sketch
- `regions()` — Decompose this sketch into its distinct filled regions. See `sketchRegions()`. Regions are returned largest-first by area.
- `region()` — Select the single filled region that contains the given 2D seed point. Throws if the seed is outside all regions. See `sketchRegion()`.
- `extrude()` — extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: 
- `revolve()` — revolve(degrees?: number, segments?: number): Shape
- `attachTo()` — attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: [ n
- `onFace()` — onFace(parentOrFace: Shape | { toShape(): Shape; } | { _bbox(): { min: number[];

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

### `ConstrainedSketchBuilder`

**Methods:**

- `point()` — point(x: number, y: number, fixed?: boolean): PointId
- `pointAt()` — pointAt(index: number): PointId
- `line()` — line(a: PointId, b: PointId, construction?: boolean): LineId
- `lineAt()` — lineAt(index: number): LineId
- `circle()` — circle(center: PointId, radius: number, construction?: boolean, segments?: numbe
- `circleAt()` — circleAt(index: number): CircleId
- `moveTo()` — moveTo(x: number, y: number): this
- `lineTo()` — lineTo(x: number, y: number): this
- `lineH()` — lineH(dx: number): this
- `lineV()` — lineV(dy: number): this
- `lineAngled()` — lineAngled(length: number, degrees: number): this
- `arcTo()` — Draw a circular arc from the current cursor position to (x, y) with the given radius. If `clockwise` is true the arc sweeps clockwise; otherwise counter-clockwise. The arc center is computed automatically.
- `arcByCenter()` — Create an arc from an explicit center point. `start` and `end` are existing PointIds that must lie on the arc's circle. Returns the ArcId. Does NOT advance the cursor.
- `bezier()` — Create a cubic Bezier curve from four control points. Returns the BezierId. Does NOT advance the cursor.
- `bezierTo()` — Draw a Bezier curve from the current cursor to (x3, y3) with control points (x1, y1) and (x2, y2).
- `close()` — close(): this
- `addLoopCircle()` — addLoopCircle(center: PointId, radius: number, segments?: number): this
- `shape()` — Register a named shape (closed polygon) from an ordered list of line IDs. Returns the ShapeId for use in shape constraints (shapeWidth, shapeCentroidX, etc.).
- `constrain()` — constrain(constraint: Omit<SketchConstraint, "id">): this
- `horizontal()` — Constrain a line to be horizontal.
- `vertical()` — Constrain a line to be vertical.
- `parallel()` — Constrain two lines to be parallel.
- `perpendicular()` — Constrain two lines to be perpendicular.
- `tangent()` — Tangent constraint. - `tangent(line, circle)` — line is tangent to a circle. - `tangent(circleA, circleB)` — two circles are externally tangent.
- `equal()` — Constrain two lines to have equal length.
- `coincident()` — Constrain two points to be at the same location.
- `concentric()` — Constrain two circles to share the same center.
- `collinear()` — Constrain a point to lie on an infinite line (collinear).
- `symmetric()` — Constrain two points to be symmetric about an axis line.
- `fix()` — Fix a point at a specific location (or at its current position if x/y are omitted).
- `midpoint()` — Constrain a point to lie at the midpoint of a line.
- `pointOnCircle()` — Constrain a point to lie on the perimeter of a circle.
- `pointOnLine()` — Constrain a point to lie on a bounded line segment (not its infinite extension).
- `distance()` — Constrain the distance between two points.
- `length()` — Constrain the length of a line.
- `angle()` — Constrain the angle from line `a` to line `b` (degrees).
- `radius()` — Constrain the radius of a circle.
- `diameter()` — Constrain the diameter of a circle.
- `hDistance()` — Constrain the horizontal distance between two points (b.x − a.x = value).
- `vDistance()` — Constrain the vertical distance between two points (b.y − a.y = value).
- `pointLineDistance()` — Constrain the signed perpendicular distance from a point to a line. Positive `value` places the point to the **left** of the line (a→b direction). Zero is equivalent to `collinear`.
- `lineDistance()` — Constrain the perpendicular (offset) distance between two lines. Also implicitly enforces parallelism. Positive `value` places line `b` on the **left** side of line `a` (according to `a`'s direction vector). Negative places it on the right.
- `absoluteAngle()` — Constrain the absolute angle of a line from the positive X-axis (degrees).
- `equalRadius()` — Constrain two circles to have equal radii.
- `arcLength()` — Constrain the arc length of an arc (radius × sweep angle).
- `lineTangentArc()` — Constrain a line to be tangent to an arc at the arc's start (`atStart=true`) or end point. Combine with `coincident` to enforce the shared endpoint.
- `arcTangentArc()` — Constrain two arcs to be tangent (G1 smooth) at a shared junction point.
- `bezierTangentArc()` — Constrain a Bezier curve to be tangent to an arc.
- `smoothBlend()` — Create a smooth Bezier bridge between two arcs with controllable weight. Returns the BezierId of the bridge curve.
- `blendTo()` — Draw a smooth Bezier curve from the current cursor to (x, y), tangent to the previous arc. Control points are computed automatically.
- `shapeWidth()` — Constrain the bounding-box width of a shape.
- `shapeHeight()` — Constrain the bounding-box height of a shape.
- `shapeCentroidX()` — Constrain the X coordinate of a shape's centroid.
- `shapeCentroidY()` — Constrain the Y coordinate of a shape's centroid.
- `shapeArea()` — Constrain the area of a shape.
- `shapeEqualCentroid()` — Constrain two shapes to share the same centroid.
- `angleBetween()` — Constrain the unsigned angle between two lines (accepts both orientations).
- `ccw()` — Enforce counter-clockwise winding on a polygon defined by its vertices.
- `addLoop()` — Register a closed polygon loop from an explicit ordered list of point IDs.
- `solve()` — solve(options?: SolveOptions): ConstraintSketch
- `solveConstraintsOnly()` — Run the solver without building a full `ConstraintSketch`. Useful for lightweight constraint validation or progress monitoring. Returns the final maxError, the number of rejected constraints, and the solved `ConstraintDefinition` with updated point positions.
- `importPoint()` — Import a Point2D, returning its PointId
- `importLine()` — Import a Line2D (two points + line), returning its LineId
- `importRectangle()` — Import a Rectangle2D as 4 points + 4 lines, returning side LineIds keyed by name
- `referencePoint()` — Add a fixed reference point at (x, y).
- `referenceLine()` — Add a fixed reference line from (x1, y1) to (x2, y2).
- `referenceFrom()` — Import a single named entity (point or line) from a solved `ConstraintSketch` as fixed reference geometry in this builder.
- `referenceAllFrom()` — Import ALL non-construction entities from a solved `ConstraintSketch` as fixed reference geometry.
- `rect()` — Add an axis-aligned rectangle concept. Returns a `ConstrainedRect` handle with named vertices, sides, and center.
- `addPolygon()` — Add a general polygon concept (CCW winding enforced). Returns a `ConstrainedPolygon` handle.
- `regularPolygon()` — Add a regular n-gon concept (equal sides, CCW winding). Returns a `ConstrainedRegularPolygon` handle with a center point.

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

### `TrackedShape`

A Shape that knows its topology — which faces and edges it has by name. Created by extruding known geometry (rectangles, polygons with named edges).

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `shape` | `Shape` | — |
| `topology` | `Topology` | — |

**Methods:**

- `face()` — Get a named face
- `edge()` — Get a named edge
- `faceNames()` — List all face names
- `edgeNames()` — List all edge names
- `clone()` — Return a new TrackedShape wrapper with copied topology metadata.
- `duplicate()` — Alias for clone()
- `geometryInfo()` — Inspect backend/representation info, including tracked-topology status.
- `withReferences()` — Attach named placement references that survive normal transforms and imports.
- `referenceNames()` — List named placement references carried by this tracked shape.
- `referencePoint()` — Resolve a named placement reference or built-in anchor to a 3D point.
- `placeReference()` — Translate the tracked shape so the given reference lands on the target coordinate.
- `translate()` — translate(x: number, y: number, z: number): TrackedShape
- `moveTo()` — Move so bounding box min corner is at the given global coordinate
- `moveToLocal()` — Move so bounding box min corner is at target's bounding box min + (x, y, z) offset
- `moveBy()` — Alias for translate — matches ideal API's moveBy
- `rotateAroundEdge()` — Rotate around a named edge by angle in degrees
- `rotate()` — Rotate using Euler angles (degrees), topology is cleared
- `transform()` — Apply a 4x4 transform matrix or Transform object. Topology is cleared.
- `pointAlong()` — Reorient so primary axis (Z) points along direction. Topology is cleared.
- `rotateAround()` — Rotate around an arbitrary axis through a pivot point. Topology is cleared.
- `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point.
- `scale()` — Scale the shape. Topology is cleared for non-uniform scale.
- `mirror()` — Mirror across a plane. Topology is cleared.
- `color()` — Set the display color. Returns a new TrackedShape.
- `material()` — Set material properties (metalness, roughness, emissive, etc.). Returns a new TrackedShape.
- `toShape()` — Access the underlying Shape for boolean ops etc
- `attachTo()` — Position this tracked shape relative to another using named 3D anchor points
- `onFace()` — Place this shape on a face of a parent shape. See Shape.onFace() for full documentation.
- `subtract()` — Boolean subtract — returns plain Shape (topology lost)
- `add()` — Boolean add — returns plain Shape (topology lost)
- `intersect()` — Boolean intersect — returns plain Shape (topology lost)
- `splitByPlane()` — Split by infinite plane. Returns [positive-side, negative-side] as plain Shapes.
- `trimByPlane()` — Keep the positive side of the plane and discard the opposite side. Returns plain Shape.
- `shell()` — Shelling returns a plain Shape because tracked topology is not preserved.
- `boundingBox()` — boundingBox(): unknown
- `get volume()` — get volume(): number
- `hole()` — hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape
- `cutout()` — cutout(sketch: Sketch, opts?: ShapeCutoutOptions): Shape

### `PathBuilder`

**Methods:**

- `moveTo()` — moveTo(x: number, y: number): this
- `lineTo()` — lineTo(x: number, y: number): this
- `lineH()` — lineH(dx: number): this
- `lineV()` — lineV(dy: number): this
- `lineAngled()` — lineAngled(length: number, degrees: number): this
- `close()` — close(): Sketch
- `stroke()` — stroke(width: number, join?: "Round" | "Square"): Sketch

### `Curve3D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `points` | `Vec3$2[]` | — |
| `closed` | `boolean` | — |
| `tension` | `number` | — |

**Methods:**

- `sampleBySegment()` — sampleBySegment(samplesPerSegment?: number): Vec3$2[]
- `sample()` — sample(count?: number): Vec3$2[]
- `pointAt()` — pointAt(t: number): Vec3$2
- `tangentAt()` — tangentAt(t: number): Vec3$2
- `length()` — length(samples?: number): number

### `Shape`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `materialProps` | `ShapeMaterialProps | undefined` | — |

**Methods:**

- `setColor()` — Set the color of this shape (hex string, e.g. "#ff0000")
- `color()` — Alias for setColor
- `material()` — Set material properties for this shape's visual appearance. Returns a new Shape with the specified material properties merged. ```js box(50, 50, 50).material({ metalness: 0.9, roughness: 0.1 }); sphere(30).material({ emissive: '#ff6b35', emissiveIntensity: 2 }); cylinder(40, 20).material({ opacity: 0.3 }); ```
- `clone()` — Return a new Shape wrapper for explicit duplication in scripts.
- `duplicate()` — Alias for clone()
- `geometryInfo()` — Inspect which backend/representation produced this solid.
- `withReferences()` — Attach named placement references that survive normal transforms and imports.
- `referenceNames()` — List named placement references carried by this shape.
- `referencePoint()` — Resolve a named placement reference or built-in anchor to a 3D point.
- `face()` — Resolve a defended semantic face by name on compile-covered shapes.
- `faceNames()` — List defended semantic face names currently available on this shape.
- `faceHistory()` — Get the transformation history for a specific face.
- `placeReference()` — Translate the shape so the given reference lands on the target coordinate.
- `translate()` — translate(x: number, y: number, z: number): Shape
- `moveTo()` — Move so bounding box min corner is at the given global coordinate
- `moveToLocal()` — Move so bounding box min corner is at target's bounding box min + (x, y, z) offset
- `rotate()` — rotate(x: number, y: number, z: number): Shape
- `transform()` — Apply a 4x4 affine transform matrix (column-major) or a Transform object.
- `scale()` — scale(v: number | [ number, number, number ]): Shape
- `mirror()` — mirror(normal: [ number, number, number ]): Shape
- `pointAlong()` — Reorient a shape so its primary axis (Z) points along the given direction. Useful for laying cylinders/extrusions along X or Y without thinking about Euler angles. Example: cylinder(40, 5).pointAlong([1, 0, 0]) — lays cylinder along X
- `rotateAround()` — Rotate around an arbitrary axis through a pivot point. Equivalent to: translate(-pivot) → rotate around axis → translate(+pivot)
- `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. `movingPoint` / `targetPoint` may be raw world points or this shape's anchors/references.
- `smoothOut()` — Mark edges for smoothing based on angle. Call refine() after to apply.
- `refine()` — Subdivide mesh, interpolating smooth surfaces set by smoothOut().
- `refineToLength()` — Subdivide until edges are shorter than length.
- `refineToTolerance()` — Subdivide until surface is within tolerance of smooth surface.
- `warp()` — Warp vertices with a function.
- `add()` — add(...others: ShapeOperandInput[]): Shape
- `subtract()` — subtract(...others: ShapeOperandInput[]): Shape
- `intersect()` — intersect(...others: ShapeOperandInput[]): Shape
- `split()` — Split into [inside, outside] by another shape.
- `splitByPlane()` — Split by infinite plane. Returns [positive-side, negative-side].
- `trimByPlane()` — Keep the positive side of the plane and discard the opposite side.
- `shell()` — Hollow out compile-covered boxes, cylinders, and straight extrudes. `openFaces` names any subset of the base shape's faces to leave open (no wall). Box bases accept any of: top, bottom, front (=side-bottom), back (=side-top), left (=side-left), right (=side-right), or the raw internal names. Cylinder and extrude bases accept top and bottom only.
- `hull()` — Convex hull of this shape.
- `simplify()` — Reduce mesh complexity. Vertices closer than tolerance are merged.
- `boundingBox()` — boundingBox(): unknown
- `volume()` — volume(): number
- `surfaceArea()` — surfaceArea(): number
- `minGap()` — Minimum distance between this shape and another.
- `isEmpty()` — isEmpty(): boolean
- `numTri()` — numTri(): number
- `getMesh()` — Extract triangle mesh for Three.js rendering
- `slice()` — Slice the runtime solid by a plane normal to local Z at the given offset.
- `project()` — Orthographically project the runtime solid onto the local XY plane.
- `attachTo()` — Position this shape relative to another using named 3D anchor points
- `onFace()` — Place this shape on a face of a parent shape. Think of it like sticking a label on a box surface: - `face` picks which surface ('front', 'back', 'top', etc.) - `u, v` position within that face's 2D plane (from center) - front/back: u = left/right (X), v = up/down (Z) - left/right: u = forward/back (Y), v = up/down (Z) - top/bottom: u = left/right (X), v = forward/back (Y) - `protrude` = how far the child sticks out (positive = outward from face)
- `hole()` — hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape
- `cutout()` — cutout(sketch: Sketch, opts?: ShapeCutoutOptions): Shape

### `ShapeGroup`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `children` | `GroupChild[]` | — |
| `childNames` | `Array<string | undefined>` | — |

**Methods:**

- `childName()` — childName(index: number): string | undefined
- `child()` — Return the named child by name. Throws if not found. Useful when importing a multipart group and working on components individually.
- `clone()` — Return a deep-cloned ShapeGroup tree (refs copied).
- `duplicate()` — Alias for clone()
- `translate()` — translate(x: number, y: number, z: number): ShapeGroup
- `boundingBox()` — boundingBox(): { min: [ number, number, number ]; max: [ number, number, number 
- `moveTo()` — Move so combined bounding box min corner is at the given global coordinate
- `moveToLocal()` — Move so combined bounding box min corner is at target's bounding box min + (x, y, z) offset
- `attachTo()` — attachTo(target: Shape | TrackedShape | ShapeGroup, targetAnchor: Anchor3D | str
- `onFace()` — Place this group on a face of a parent shape. See Shape.onFace() for full documentation.
- `rotate()` — rotate(x: number, y: number, z: number): ShapeGroup
- `rotateAround()` — Rotate around an arbitrary axis through a pivot point. Sugar for: group.transform(Transform.rotationAxis(axis, angleDeg, pivot))
- `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. ShapeGroup string points use built-in anchors only.
- `pointAlong()` — Reorient all 3D children so their primary axis (Z) points along direction. Sugar for a single group-wide axis rotation via Transform.rotationAxis(...).
- `transform()` — Apply a 4x4 transform matrix or Transform object to all 3D children.
- `scale()` — scale(v: number | [ number, number, number ]): ShapeGroup
- `mirror()` — mirror(normal: [ number, number, number ]): ShapeGroup
- `color()` — color(hex: string): ShapeGroup
- `withReferences()` — Attach named placement references to this group. References survive normal transforms (translate/rotate/scale/mirror/transform). ```javascript const bracket = group( { name: 'Left', shape: leftShape }, { name: 'Right', shape: rightShape }, ).withReferences({ points: { mountCenter: [0, 0, 0] }, }); ```
- `referenceNames()` — List named placement references carried by this group.
- `referencePoint()` — Resolve a named placement reference or built-in Anchor3D to a 3D point. Named refs take priority over built-in anchors.
- `placeReference()` — Translate the group so the given reference lands on the target coordinate. ```javascript const placed = importGroup('bracket-assembly.forge.js') .placeReference('mountCenter', [0, 0, 50]); ```

### `SolvedAssembly`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

- `warnings()` — warnings(): string[]
- `getJointState()` — getJointState(): JointState
- `getTransform()` — getTransform(partName: string): Transform
- `getPart()` — getPart(partName: string): AssemblyPart
- `toGroup()` — Convert all solved parts to a ShapeGroup with named children. Each part becomes a child, positioned at its solved transform. This is the primary way to get a group for rendering, `show()`, or embedding.
- `toSceneObjects()` — Return an array of named scene objects for the viewport renderer. Prefer `toGroup()` for most uses; this method exists for advanced scene-graph control.
- `toScene()` — toScene(): Array<{ name: string; shape?: Shape; group?: Array<{ name: string; sh
- `bom()` — bom(): BomRow[]
- `bomCsv()` — bomCsv(): string
- `collisionReport()` — collisionReport(options?: CollisionOptions): CollisionFinding[]
- `minClearance()` — minClearance(partA: string, partB: string, searchLength?: number): number

### `Assembly`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

- `withReferences()` — Attach named placement reference points to this assembly. These are surfaced automatically on the ImportedAssembly when this file is imported with importAssembly(), so consumers can use placeReference() without re-declaring them. Returns `this` for chaining.
- `getReferences()` — getReferences(): PlacementReferences
- `addFrame()` — Add a virtual reference frame (no geometry) to the assembly graph.
- `addPart()` — addPart(name: string, part: AssemblyPart, options?: PartOptions): Assembly
- `addJoint()` — addJoint(name: string, type: JointType, parent: string, child: string, options?:
- `addRevolute()` — addRevolute(name: string, parent: string, child: string, options?: JointOptions)
- `addPrismatic()` — addPrismatic(name: string, parent: string, child: string, options?: JointOptions
- `addFixed()` — addFixed(name: string, parent: string, child: string, options?: JointOptions): A
- `addJointCoupling()` — addJointCoupling(jointName: string, options: JointCouplingOptions): Assembly
- `addGearCoupling()` — addGearCoupling(drivenJointName: string, driverJointName: string, options?: Gear
- `solve()` — solve(state?: JointState): SolvedAssembly
- `sweepJoint()` — sweepJoint(jointName: string, from: number, to: number, steps: number, baseState
- `describe()` — describe(): AssemblyDefinition

### `ImportedAssembly`

Wraps an imported Assembly, giving access to named parts and group conversion without losing the kinematic structure. Supports placement references (`.withReferences()` / `.placeReference()`) so sub-assemblies can be positioned the same way as imported parts and groups.

**Methods:**

- `get assembly()` — The underlying Assembly — use for sweepJoint, addPart into parent, etc.
- `solve()` — Solve the assembly at the given joint state (defaults to each joint's default value).
- `part()` — Return a specific named part positioned at the given joint state, with any stored placement offset applied.
- `toGroup()` — Convert all assembly parts to a ShapeGroup with named children. Child names match the part names used in the assembly. Any stored placement offset and placement references are forwarded to the group.
- `withReferences()` — Attach named placement reference points to this assembly. Points are simple 3D coordinates (relative to the assembly's own origin). Returns a new ImportedAssembly — does not mutate.
- `referenceNames()` — List all attached placement reference names.
- `placeReference()` — Translate the assembly so the named reference point lands on `target`. Returns a new ImportedAssembly — does not mutate. All point refs are translated by the same delta.
- `translate()` — Solve at defaults and return a translated ShapeGroup.
- `rotate()` — Solve at defaults and return a rotated ShapeGroup (Euler XYZ degrees).
- `scale()` — Solve at defaults and return a scaled ShapeGroup.
- `mirror()` — Solve at defaults and return a mirrored ShapeGroup.
- `color()` — Solve at defaults and return a colored ShapeGroup.
- `child()` — Solve at defaults, get a named child part from the resulting group.
- `mergeInto()` — Flatten this sub-assembly's parts and joints into `parent`, then wire a mount joint connecting `mountParent` (a part already in `parent`) to the sub-assembly root. All part names and joint names from the sub-assembly are prefixed with `"${options.prefix}."` to avoid collisions. After the merge you can drive sub-assembly joints from the parent: `parent.solve({ "Left Arm.shoulder": 45 })`. Throws if the sub-assembly has multiple root parts (connect them with addFixed first). Returns `parent` for chaining.

### `SheetMetalPart`

**Methods:**

- `flange()` — flange(edge: SheetMetalEdge, options: SheetMetalFlangeOptions): SheetMetalPart
- `cutout()` — cutout(region: SheetMetalPlanarRegionName, sketch: Sketch, options?: SheetMetalC
- `regionNames()` — regionNames(): SheetMetalRegionName[]
- `folded()` — folded(): Shape
- `flatPattern()` — flatPattern(): Shape

---

## Constants

### `Constraint`

**Members:**

- `makeParallel()` — makeParallel(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): Constra
- `enforceAngle()` — enforceAngle(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg, angleDeg
- `horizontal()` — horizontal(builder: ConstrainedSketchBuilder, line: LineArg): ConstrainedSketchB
- `vertical()` — vertical(builder: ConstrainedSketchBuilder, line: LineArg): ConstrainedSketchBui
- `equalLength()` — equalLength(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): Constrai
- `distance()` — distance(builder: ConstrainedSketchBuilder, a: PointArg, b: PointArg, value: num
- `fix()` — fix(builder: ConstrainedSketchBuilder, pt: PointArg, x: number, y: number): Cons
- `coincident()` — coincident(builder: ConstrainedSketchBuilder, a: PointArg, b: PointArg): Constra
- `perpendicular()` — perpendicular(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): Constr
- `length()` — length(builder: ConstrainedSketchBuilder, line: LineArg, value: number): Constra

### `SHEET_METAL_EDGES`

### `ANCHOR3D_NAMES`

### `verify`

**Members:**

- `that()` — Custom predicate check.
- `equal()` — Check that two numbers are approximately equal (within tolerance).
- `notEqual()` — Check that two numbers are NOT equal (differ by more than tolerance).
- `greaterThan()` — Check that actual > min.
- `lessThan()` — Check that actual < max.
- `inRange()` — Check that min <= actual <= max.
- `centersCoincide()` — Check that the bounding-box centers of two shapes coincide within tolerance (mm).
- `notColliding()` — Check that two shapes do not collide (minGap > 0).
- `minClearance()` — Check that a minimum clearance gap exists between two shapes.
- `parallel()` — Check that two face normals are parallel (within toleranceDeg degrees).
- `perpendicular()` — Check that two face normals are perpendicular (within toleranceDeg degrees).
- `coplanar()` — Check that a face is coplanar with (same plane as) another face, meaning they are parallel AND their centers lie on the same plane.
- `faceAt()` — Check that a face center lies at a specific position (within toleranceMm).
- `sameDirection()` — Check that two face normals point in the same direction (not antiparallel). Stricter than parallel — both |angle| AND sign must match.
- `isEmpty()` — Check that a shape is empty.
- `notEmpty()` — Check that a shape is NOT empty.
- `volumeApprox()` — Check that a shape's volume is approximately equal to expected (mm³).
- `areaApprox()` — Check that a shape's surface area is approximately equal to expected (mm²).
- `boundingBoxSize()` — Check that a shape's bounding box has approximately the given size.

### `partLibrary`

All library parts, keyed by name

**Members:**

- `boltHole()` — boltHole: typeof boltHole
- `fastenerHole()` — fastenerHole: typeof fastenerHole
- `counterbore()` — counterbore: typeof counterbore
- `tube()` — tube: typeof tube
- `pipe()` — pipe: typeof pipe
- `explode()` — explode: typeof explode
- `hexNut()` — hexNut: typeof hexNut
- `roundedBox()` — roundedBox: typeof roundedBox
- `bracket()` — bracket: typeof bracket
- `holePattern()` — holePattern: typeof holePattern
- `thread()` — thread: typeof thread
- `bolt()` — bolt: typeof bolt
- `nut()` — nut: typeof nut
- `washer()` — washer: typeof washer
- `fastenerSet()` — fastenerSet: typeof fastenerSet
- `pipeRoute()` — pipeRoute: typeof pipeRoute
- `elbow()` — elbow: typeof elbow
- `tSlotProfile()` — tSlotProfile: typeof tSlotProfile
- `tSlotExtrusion()` — tSlotExtrusion: typeof tSlotExtrusion
- `profile2020BSlot6Profile()` — profile2020BSlot6Profile: typeof profile2020BSlot6Profile
- `profile2020BSlot6()` — profile2020BSlot6: typeof profile2020BSlot6
- `spurGear()` — spurGear: typeof spurGear
- `bevelGear()` — bevelGear: typeof bevelGear
- `faceGear()` — faceGear: typeof faceGear
- `sideGear()` — sideGear: typeof sideGear
- `ringGear()` — ringGear: typeof ringGear
- `rackGear()` — rackGear: typeof rackGear
- `gearPair()` — gearPair: typeof gearPair
- `bevelGearPair()` — bevelGearPair: typeof bevelGearPair
- `faceGearPair()` — faceGearPair: typeof faceGearPair
- `sideGearPair()` — sideGearPair: typeof sideGearPair

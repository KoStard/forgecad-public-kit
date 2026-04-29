---
skill-group: curves
skill-order: 100
---

# Curves & Surfacing

Smooth curves, lofted surfaces, swept solids, and splines.

## Contents

- [Curves & Surfacing](#curves-surfacing) — `hermiteTransitionG2`, `nurbs3d`, `spline2d`, `spline3d`, `loft`, `loftAlongSpine`, `sweep`, `variableSweep`, `nurbsSurface`, `surfacePatch`, `transitionCurve`, `transitionSurface`, `connectEdges`
- [Curve3D](#curve3d)
- [NurbsCurve3D](#nurbscurve3d)
- [NurbsSurface](#nurbssurface)
- [PathBuilder](#pathbuilder) — Line Segments, Arcs, Curves, Closing & Output
- [HermiteCurve3D](#hermitecurve3d)
- [QuinticHermiteCurve3D](#quintichermitecurve3d)
- [Surface](#surface)
- [Blend](#blend)
- [Analysis](#analysis)

## Functions

### Curves & Surfacing

#### `hermiteTransitionG2()` — Create a quintic Hermite transition curve between two edge endpoints (G2 continuity).

The curve starts at `a.point` tangent to `a.tangent` with curvature `a.curvature`, and ends at `b.point` tangent to `b.tangent` with curvature `b.curvature`, with smooth G2-continuous interpolation matching position, tangent, and curvature.

```ts
hermiteTransitionG2(a: QuinticHermiteCurveEndpoint, b: QuinticHermiteCurveEndpoint): QuinticHermiteCurve3D
```

**`QuinticHermiteCurveEndpoint`**

| Option | Type | Description |
|--------|------|-------------|
| `point` | `Vec3` | Position |
| `tangent` | `Vec3` | Tangent direction (will be normalized internally) |
| `curvature?` | `Vec3` | Second derivative / curvature vector. Default [0, 0, 0]. |
| `weight?` | `number` | Weight: scales tangent magnitude relative to chord length. Default 1.0. |

#### `nurbs3d()` — Create a NURBS curve from control points.

With default options, creates a cubic non-rational B-spline with uniform clamped knots. Set `weights` for rational curves (exact circles, conics). Set `degree` for linear (1), quadratic (2), cubic (3), or higher-order curves.

```js
// Simple cubic B-spline through control points
const curve = nurbs3d([[0,0,0], [10,5,0], [20,-5,10], [30,0,5]]);
const tube = sweep(circle(2), curve);
```

```js
// Rational quadratic — exact circular arc
const arc = nurbs3d(
  [[10,0,0], [10,10,0], [0,10,0]],
  { degree: 2, weights: [1, Math.SQRT1_2, 1] }
);
```

```ts
nurbs3d(points: Vec3[], options?: NurbsCurve3DOptions): NurbsCurve3D
```

**`NurbsCurve3DOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `degree?` | `number` | Polynomial degree (default 3 = cubic). Must be ≥ 1. |
| `weights?` | `number[]` | Rational weights, one per control point (default: all 1.0 = non-rational). |
| `knots?` | `number[]` | Knot vector (default: uniform clamped). Must have length = controlPoints.length + degree + 1. |
| `closed?` | `boolean` | Whether the curve is closed/periodic (default false). |

#### `spline2d()` — Build a smooth Catmull-Rom spline sketch from 2D control points.

A closed spline (default) returns a filled profile. An open spline requires a strokeWidth option to produce a solid sketch. Use tension (0..1, default 0.5) to control curve tightness.

```ts
spline2d(points: Vec2[], options?: Spline2DOptions): Sketch
```

**`Spline2DOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `closed?` | `boolean` | Closed loop (default true). |
| `tension?` | `number` | Catmull-Rom tension in [0, 1]. 0 = very round, 1 = linear-ish. Default 0.5. |
| `samplesPerSegment?` | `number` | Samples per segment (minimum 3). Default 16. |
| `strokeWidth?` | `number` | For open splines, provide stroke width to return a solid Sketch. If omitted for open splines, an error is thrown. |
| `join?` | `"Round" \| "Square"` | Stroke join for open splines. Default 'Round'. |

#### `spline3d()` — Create a reusable 3D spline curve object (Catmull-Rom).

The returned Curve3D provides sample(), pointAt(t), tangentAt(t), and length() for downstream use in sweep() or manual path operations.

```ts
spline3d(points: Vec3[], options?: Spline3DOptions): Curve3D
```

**`Spline3DOptions`**
- `closed?: boolean` — Closed loop (default false).
- `tension?: number` — Catmull-Rom tension in [0, 1]. 0 = very round, 1 = linear-ish. Default 0.5.

#### `loft()` — Loft between multiple sketches along Z stations.

Profiles can differ in topology and vertex count: interpolation is done on signed-distance fields and meshed with level-set extraction. Heights must be strictly increasing. Compatible loft stacks can also stay on the maintained export-backend path.

Performance note: loft is significantly heavier than primitive/extrude/revolve. If the part is axis-symmetric (bottles, vases, knobs), prefer revolve().

```ts
loft(profiles: Sketch[], heights: number[], options?: LoftOptions): Shape
```

**`LoftOptions`**
- `edgeLength?: number` — Marching-grid edge length for level-set meshing. Smaller = finer.
- `boundsPadding?: number` — Optional extra bounds padding.

#### `loftAlongSpine()` — Loft between multiple profiles positioned along an arbitrary 3D spine curve.

Unlike loft() which only supports Z heights, loftAlongSpine() places each profile at a position along a 3D spine, oriented perpendicular to the spine tangent. This enables lofting along curved paths — e.g., a wing root-to-tip transition that follows a swept-back leading edge.

The tValues array specifies where each profile sits along the spine (0 = start, 1 = end). Must have the same length as profiles and be in [0, 1].

Internally uses variableSweep infrastructure with SDF interpolation.

Performance note: uses level-set meshing, heavier than simple loft().

```ts
loftAlongSpine(profiles: Sketch[], spine: Curve3D | Vec3[], tValues: number[], options?: LoftAlongSpineOptions): Shape
```

**`LoftAlongSpineOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `samples?` | `number` | Number of samples when spine is a Curve3D. Default 48. |
| `edgeLength?` | `number` | Marching-grid edge length for level-set meshing. Smaller = finer. |
| `boundsPadding?` | `number` | Optional extra bounds padding. |
| `up?` | `Vec3` | Preferred "up" vector for local profile frame. Auto fallback is used near parallel segments. |

#### `sweep()`

```ts
sweep(profile: Sketch, path: SweepPathInput, options?: SweepOptions): Shape
```

**`SweepOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `samples?` | `number` | Number of samples when path is a Curve3D. Default 48. |
| `edgeLength?` | `number` | Marching-grid edge length for level-set meshing. Smaller = finer. |
| `boundsPadding?` | `number` | Optional extra bounds padding. |
| `up?` | `Vec3` | Preferred "up" vector for local profile frame. Auto fallback is used near parallel segments. |

#### `variableSweep()` — Sweep a variable cross-section along a 3D spine curve.

Unlike sweep(), which uses a single constant profile, variableSweep() interpolates between multiple profiles at different stations along the spine. This enables organic shapes like tapering tubes, bone-like structures, and sculptural forms.

Each section specifies a t parameter (0 = start, 1 = end of spine) and a 2D profile sketch. The SDF-based level-set mesher smoothly blends between profiles at intermediate positions.

Performance note: like sweep(), this uses level-set meshing internally.

```ts
variableSweep(spine: SweepPathInput, sections: VariableSweepSection[], options?: VariableSweepOptions): Shape
```

**`VariableSweepSection`**
- `t: number` — Parameter along the spine (0 = start, 1 = end).
- `profile: Sketch` — Cross-section profile at this station.

**`VariableSweepOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `samples?` | `number` | Number of samples when spine is a Curve3D. Default 48. |
| `edgeLength?` | `number` | Marching-grid edge length for level-set meshing. Smaller = finer. |
| `boundsPadding?` | `number` | Optional extra bounds padding. |
| `up?` | `Vec3` | Preferred "up" vector for local profile frame. Auto fallback is used near parallel segments. |

#### `nurbsSurface()` — Create a NURBS surface from a grid of control points.

The control grid is indexed as `controlGrid[u][v]` — each row is a curve in the V direction, and columns trace curves in the U direction.

With default options, creates a bicubic non-rational B-spline surface with uniform clamped knots.

```js
// Simple 4×4 control grid — a gently curved surface
const grid = [
  [[0,0,0], [10,0,2], [20,0,2], [30,0,0]],
  [[0,10,1], [10,10,5], [20,10,5], [30,10,1]],
  [[0,20,1], [10,20,5], [20,20,5], [30,20,1]],
  [[0,30,0], [10,30,2], [20,30,2], [30,30,0]],
];
const surface = nurbsSurface(grid, { thickness: 2 });
```

```ts
nurbsSurface(controlGrid: Vec3[][], options?: NurbsSurfaceOptions): Shape
```

**`NurbsSurfaceOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `degreeU?` | `number` | Degree in U direction (default 3). |
| `degreeV?` | `number` | Degree in V direction (default 3). |
| `weights?` | `number[][]` | Weights grid — same dimensions as controlGrid (default: all 1.0). |
| `knotsU?` | `number[]` | Knot vector in U direction (default: uniform clamped). |
| `knotsV?` | `number[]` | Knot vector in V direction (default: uniform clamped). |
| `thickness?` | `number` | Sheet thickness — if > 0, thickens the surface into a solid (default 0 = surface only). |
| `resolution?` | `number` | Tessellation resolution — points per direction (default 32). |
| `approximate?` | `boolean` | Explicit opt-in for sampled fallback paths on non-exact backends. |

#### `surfacePatch()` — Create a smooth surface patch from 4 boundary curves (Coons patch).

The four curves form the boundary of a quadrilateral patch:

- bottom: u=0..1 at v=0 (from corner00 to corner10)
- top: u=0..1 at v=1 (from corner01 to corner11)
- left: v=0..1 at u=0 (from corner00 to corner01)
- right: v=0..1 at u=1 (from corner10 to corner11)

The interior is filled using bilinear Coons patch interpolation: P(u,v) = Lc(u,v) + Ld(u,v) - B(u,v)

The result is a thin solid created by offsetting the surface mesh along its normals by the specified thickness.

Note: curves should meet at corners. Small gaps are tolerated.

```ts
surfacePatch(curves: { ... }, options?: SurfacePatchOptions): Shape
```

**`SurfacePatchOptions`**
- `resolution?: number` — Number of samples along each direction. Default 24.
- `thickness?: number` — Thickness of the generated solid. Default 0 for an open exact sheet.
- `approximate?: boolean` — Allow explicit approximation for non-exact curve inputs such as Curve3D samples.

#### `transitionCurve()` — Create a smooth transition curve between two edges.

Returns a `HermiteCurve3D` that starts at `edgeA.point` tangent to `edgeA.tangent` and ends at `edgeB.point` tangent to `edgeB.tangent`.

The curve maintains G1 continuity (matching tangent direction) at both endpoints. Weight parameters control the shape of the transition.

```js
// Connect two edges with a balanced transition
const curve = transitionCurve(
  { point: [0, 0, 0], tangent: [1, 0, 0] },
  { point: [10, 5, 0], tangent: [1, 0, 0] },
);
```

// Weighted: curve hugs edge A longer const weighted = transitionCurve( { point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 5, 0], tangent: [1, 0, 0] }, { weightA: 2.0, weightB: 0.5 }, );

```

```ts
transitionCurve(edgeA: TransitionEdge, edgeB: TransitionEdge, options?: TransitionCurveOptions): HermiteCurve3D
```

**`TransitionEdge`**
- `point: Vec3` — Connection point on the edge. Can be any point along the edge where the transition should connect.
- `tangent: Vec3` — Tangent direction at the connection point. This is the direction the curve should initially follow when leaving this edge. For a straight edge, this is typically the edge direction pointing "outward" (away from the body of the edge, toward the other edge).
- `normal?: Vec3` — Surface normal at the connection point (optional). Used as a hint for the sweep frame's up vector.

**`TransitionCurveOptions`**
- `weightA?: number` — Weight for the start edge. Controls tangent magnitude at the start. - 1.0 (default): balanced transition - > 1.0: curve follows start edge longer before turning - < 1.0: curve turns sooner at the start
- `weightB?: number` — Weight for the end edge. Controls tangent magnitude at the end. - 1.0 (default): balanced transition - > 1.0: curve follows end edge longer before turning - < 1.0: curve turns sooner at the end
- `samples?: number` — Number of sample points for the output polyline. Default 64. Higher values give smoother curves at the cost of more geometry.

#### `transitionSurface()` — Create a solid transition surface between two edges by sweeping a profile along a Hermite transition curve.

This produces a watertight solid that smoothly connects the two edges. Works with both Manifold and OCCT backends.

```js
// Circular tube connecting two edges
const tube = transitionSurface(
  { point: [0, 0, 0], tangent: [1, 0, 0] },
  { point: [10, 5, 3], tangent: [0, 1, 0] },
  { radius: 0.5 },
);
```

// Custom profile with weights const custom = transitionSurface( { point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 5, 3], tangent: [0, 1, 0] }, { profile: mySketch, weightA: 1.5, weightB: 0.8 }, );

```

```ts
transitionSurface(edgeA: TransitionEdge, edgeB: TransitionEdge, options?: TransitionSurfaceOptions): Shape
```


**`TransitionSurfaceOptions`** extends TransitionCurveOptions

| Option | Type | Description |
|--------|------|-------------|
| `profile?` | `Sketch` | Cross-section profile to sweep along the transition curve. If omitted, a circular profile with `radius` is used. |
| `radius?` | `number` | Radius of circular cross-section (used when `profile` is omitted). Default: 5% of chord length. |
| `rectangleSection?` | `{ width: number; height: number; }` | Width and height for rectangular cross-section. Alternative to `radius` when `profile` is omitted. |
| `up?` | `Vec3` | Preferred up vector for the sweep frame. Default: auto-detected. |
| `edgeLength?` | `number` | Edge length for level-set meshing. Smaller = finer. |
| `boundsPadding?` | `number` | Extra bounds padding for level-set meshing. |

#### `connectEdges()` — Create a transition surface or solid bridge between two edge segments.

Tangents can be inferred from neighboring geometry or supplied explicitly through `options`. This is useful for loft-like blends where you want a direct connection between two edge spans.

```ts
connectEdges(edgeA: EdgeSegment, edgeB: EdgeSegment, options?: ConnectEdgesOptions): Shape
```

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


**`ConnectEdgesOptions`** extends TransitionSurfaceOptions

| Option | Type | Description |
|--------|------|-------------|
| `endA?` | `EdgeEnd` | Which end of edge A to connect. Default: 'start'. |
| `endB?` | `EdgeEnd` | Which end of edge B to connect. Default: 'start'. |
| `tangentModeA?` | `TangentMode` | Tangent mode for edge A. Default: 'along'. |
| `tangentModeB?` | `TangentMode` | Tangent mode for edge B. Default: 'along'. |
| `tangentA?` | `Vec3` | Explicit tangent for edge A. |
| `tangentB?` | `Vec3` | Explicit tangent for edge B. |
| `flipA?` | `boolean` | Flip tangent A. |
| `flipB?` | `boolean` | Flip tangent B. |

---

## Classes

### `Curve3D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `points` | `Vec3[]` | — |
| `closed` | `boolean` | — |
| `tension` | `number` | — |

**Methods:**

#### `sampleBySegment()` — Sample the curve with a fixed number of points per segment.

```ts
sampleBySegment(samplesPerSegment?: number): Vec3[]
```

#### `sample()` — Sample the curve to an approximate total point count.

```ts
sample(count?: number): Vec3[]
```

#### `pointAt()` — Return the position on the curve at normalized parameter `t` in `[0, 1]`. O(1), no allocations.

```ts
pointAt(t: number): Vec3
```

#### `tangentAt()` — Return a unit tangent vector at normalized parameter `t` in `[0, 1]`. O(1), analytical derivative.

```ts
tangentAt(t: number): Vec3
```

#### `length()` — Approximate the curve length by polyline sampling.

```ts
length(samples?: number): number
```

### `NurbsCurve3D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `controlPoints` | `Vec3[]` | — |
| `weights` | `number[]` | — |
| `knots` | `number[]` | — |
| `degree` | `number` | — |
| `closed` | `boolean` | — |

**Methods:**

#### `pointAt()` — Evaluate the curve at parameter t ∈ [0, 1]. Uses De Boor's algorithm — exact, O(degree²).

```ts
pointAt(t: number): Vec3
```

#### `tangentAt()` — Evaluate the unit tangent vector at parameter t ∈ [0, 1].

```ts
tangentAt(t: number): Vec3
```

#### `sample()` — Sample the curve uniformly at `count` points.

```ts
sample(count?: number): Vec3[]
```

#### `sampleAdaptive()` — Sample with adaptive density — more points in high-curvature regions.

```ts
sampleAdaptive(minCount?: number, maxCount?: number): Vec3[]
```

#### `length()` — Approximate arc length by summing polyline segment lengths.

```ts
length(samples?: number): number
```

#### `toPolyline()` — Convert to a format compatible with sweep() path input.

```ts
toPolyline(samples?: number): Vec3[]
```

### `NurbsSurface`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `controlGrid` | `Vec3[][]` | — |
| `weightsGrid` | `number[][]` | — |
| `knotsU` | `number[]` | — |
| `knotsV` | `number[]` | — |
| `degreeU` | `number` | — |
| `degreeV` | `number` | — |
| `nU` | `number` | — |
| `nV` | `number` | — |

**Methods:**

#### `pointAt()` — Evaluate the surface at parameters (u, v) ∈ [0, 1]². Uses tensor product evaluation: evaluate basis functions in U and V independently.

```ts
pointAt(u: number, v: number): Vec3
```

#### `normalAt()` — Evaluate the surface normal at (u, v) via cross product of partial derivatives.

```ts
normalAt(u: number, v: number): Vec3
```

#### `tessellate()` — Tessellate the surface into a triangle mesh. Returns positions, normals, and triangle indices.

```ts
tessellate(resU?: number, resV?: number): { positions: Vec3[]; normals: Vec3[]; indices: number[]; }
```

### `PathBuilder`

**Line Segments**

#### `moveTo()` — Move the cursor to an absolute position without drawing a segment.

When called after the initial [`path()`](/docs/sketch#path), this establishes the start of the outline. Calling `moveTo` again mid-path starts a new sub-path (hole in `close()`, separate segment for [`stroke()`](/docs/sketch#stroke)).

```ts
moveTo(x: number, y: number): this
```

#### `lineTo()` — Draw a straight line from the current cursor to an absolute position.

```ts
lineTo(x: number, y: number): this
```

#### `lineH()` — Draw a horizontal line segment by `dx` units from the current cursor.

Positive `dx` moves right; negative moves left.

```ts
lineH(dx: number): this
```

#### `lineV()` — Draw a vertical line segment by `dy` units from the current cursor.

Positive `dy` moves up; negative moves down.

```ts
lineV(dy: number): this
```

#### `lineAngled()` — Draw a line at the given angle and length from the current cursor.

Angle convention: `0°` points right (+X), `90°` points up (+Y).

```ts
// L-bracket with angled return
path().moveTo(0, 0).lineH(50).lineV(-70).lineAngled(20, 235).stroke(4);
```

```ts
lineAngled(length: number, degrees: number): this
```

**Arcs**

#### `arc()` — Draw an arc defined by center, radius, and angle range (no trig needed). If the path has no segments yet, automatically moves to the arc start. Positive sweep (startDeg < endDeg) = CCW, negative = CW.

```js
// Arc centered at (10, 0), radius 50, from -30° to +30°
path().arc(10, 0, 50, -30, 30).stroke(8, 'Round')
```

```ts
arc(cx: number, cy: number, radius: number, startDeg: number, endDeg: number): this
```

#### `arcTo()` — Draw a circular arc from the current position to (x, y) with the given radius. `clockwise=true` → arc curves to the right of the start→end direction. `clockwise=false` → arc curves to the left of the start→end direction.

```ts
arcTo(x: number, y: number, radius: number, clockwise?: boolean): this
```

#### `tangentArcTo()` — G1-continuous arc — radius derived from current tangent + endpoint. Throws if endpoint is collinear with current direction.

```ts
tangentArcTo(x: number, y: number): this
```

**Curves**

#### `bezierTo()` — Cubic bezier from current position to (x, y) via two control points.

```ts
bezierTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this
```

**Closing & Output**

#### `close()` — Close the path and return a filled [`Sketch`](/docs/sketch#sketch).

The winding of the polygon is automatically corrected to CCW (the expected orientation for ForgeCAD sketches). If the path contains multiple sub-paths (started with subsequent `moveTo` calls), the first sub-path is the outer contour and subsequent sub-paths become holes subtracted from it.

Edge labels (assigned with `.label('name')`) are transferred to the resulting sketch and propagate through `extrude()`, `revolve()`, `loft()`, and `sweep()` into named faces on the resulting [`Shape`](/docs/core#shape).

```ts
const triangle = path().moveTo(0, 0).lineH(50).lineV(30).close();

// With a hole (second sub-path)
const frame = path()
  .moveTo(0, 0).lineH(40).lineV(30).lineH(-40).close(); // outer
  // (hole would be added with another moveTo and line sequence before close)
```

```ts
close(): Sketch
```

#### `closeLabel()` — Label the closing segment and close the path. Shorthand for labeling the implicit line from the last point back to the start, then closing.

```ts
closeLabel(name: string): Sketch
```

#### [`stroke()`](/docs/sketch#stroke) — Thicken an open polyline (centerline) into a solid filled profile with uniform width.

Expands the path into a closed profile `width` units wide (half-width on each side of the centerline). Use `'Round'` for ribs, wire traces, and organic profiles — it adds semicircular endcaps and rounds joins. Use `'Square'` (default) for sharp miter joins without endcaps.

Not the same as rounding corners of a closed polygon — for mixed sharp-and-rounded outlines, build the polygon first and apply [`filletCorners()`](/docs/sketch#filletcorners).

```ts
// Square-join L-bracket
const bracket = path().moveTo(0, 0).lineH(50).lineV(-70).lineAngled(20, 235).stroke(4);

// Round-join rib
const rib = path().moveTo(0, 0).lineH(60).stroke(6, 'Round');

// Equivalent standalone form
const wire = stroke([[0, 0], [50, 0], [50, -70]], 4);
```

and semicircular endcaps.

```ts
stroke(width: number, join?: "Round" | "Square"): Sketch
```

#### `label()` — Label the most recently added segment. Labels are born here and grow into face names when the sketch is extruded, lofted, swept, or revolved.

Labels must be unique within a path. Each segment can have at most one label.

```ts
label(name: string): this
```

**Other**

#### `getX()` — Current cursor X position.

```ts
getX(): number
```

#### `getY()` — Current cursor Y position.

```ts
getY(): number
```

#### `lineBy()` — Draw a line by a relative `(dx, dy)` displacement from the current cursor.

```ts
lineBy(dx: number, dy: number): this
```

#### `arcBy()` — Draw an arc to a point offset from the current cursor.

```ts
arcBy(dx: number, dy: number, radius: number, clockwise?: boolean): this
```

#### `bezierBy()` — Draw a cubic Bezier using control points relative to the current cursor.

```ts
bezierBy(dcp1x: number, dcp1y: number, dcp2x: number, dcp2y: number, dx: number, dy: number): this
```

#### `arcAround()` — Arc around a known center point, sweeping by the given angle. Radius is derived from the distance between the current position and the center. Positive sweep = CCW (math convention), negative = CW.

```js
// Arc 90° CCW around (50, 50)
path().moveTo(70, 50).arcAround(50, 50, 90)
// Arc 45° CW around the origin
path().moveTo(10, 0).arcAround(0, 0, -45)
```

```ts
arcAround(cx: number, cy: number, sweepDeg: number): this
```

#### `arcAroundRelative()` — Arc around a center point given as an offset from the current position. `(dx, dy)` is the vector from the current point to the center. Positive sweep = CCW (math convention), negative = CW.

```js
// Arc 90° CCW around a center 20 units to the right
path().moveTo(50, 50).arcAroundRelative(20, 0, 90)
// Equivalent to: path().moveTo(50, 50).arcAround(70, 50, 90)
```

```ts
arcAroundRelative(dx: number, dy: number, sweepDeg: number): this
```

#### `smoothCapTo()` — Smooth three-arc end cap from the current position to (endX, endY). Inserts: small corner arc → large cap arc → small corner arc, all G1-continuous.

```ts
smoothCapTo(endX: number, endY: number, cornerRadius: number, capRadius: number): this
```

#### `tangentBezierTo()` — G1-continuous cubic bezier — first control point is auto-derived from the current tangent direction. `weight` controls how far the auto-placed control point extends along the tangent (default: 1/3 of the chord).

The second control point `(cp2x, cp2y)` must be provided — it controls the arrival curvature. For a fully automatic smooth curve, see `smoothThrough`.

```ts
tangentBezierTo(cp2x: number, cp2y: number, x: number, y: number, weight?: number): this
```

#### `smoothThrough()` — Catmull-Rom spline through a list of waypoints from the current position. The current position is included as the first point. The last waypoint becomes the new cursor position.

```ts
smoothThrough(waypoints: [ number, number ][], tension?: number): this
```

#### `nurbsTo()` — Rational B-spline edge to (x, y) with explicit control points and weights.

The control points define the B-spline shape between the current position and (x, y). The current position is NOT included in `controlPoints` — it is automatically prepended. The endpoint (x, y) is the last control point.

```ts
nurbsTo(controlPoints: [ number, number ][], opts?: { weights?: number[]; degree?: number; }): this
```

#### `exactArcTo()` — Exact circular arc to (x, y) using a rational quadratic NURBS.

Unlike `arcTo()` which tessellates to a polyline, this preserves the exact arc definition. When extruded through the OCCT backend, it produces a true cylindrical face — not a faceted approximation.

```ts
exactArcTo(x: number, y: number, opts?: { radius?: number; clockwise?: boolean; }): this
```

#### [`fillet()`](/docs/core#fillet) — Round the last corner (the junction between the previous two segments) with a tangent arc of the given radius.

Must be called after at least two line/arc segments that form a corner. The fillet trims back both segments and inserts a tangent arc.

```js
path().moveTo(0,0).lineTo(10,0).lineTo(10,10).fillet(2).lineTo(0,10).close()
```

```ts
fillet(radius: number): this
```

#### [`chamfer()`](/docs/core#chamfer) — Chamfer the last corner with a straight cut of the given distance.

```js
path().moveTo(0,0).lineTo(10,0).lineTo(10,10).chamfer(2).lineTo(0,10).close()
```

```ts
chamfer(distance: number): this
```

#### `mirror()` — Mirror all existing segments across an axis and append the mirrored copy in reverse order, creating a symmetric path. The axis passes through the current cursor position.

'y' mirrors across the local Y-axis (flips X), or `[nx, ny]` for an arbitrary axis direction.

```js
// Build right half, mirror to get full symmetric profile
path().moveTo(0,0).lineTo(10,0).lineTo(10,5).mirror('x').close()
```

```ts
mirror(axis: "x" | "y" | [ number, number ]): this
```

#### `closeOffset()` — Close the path and return an offset version of the filled Sketch. Positive delta expands outward, negative shrinks inward.

```ts
closeOffset(delta: number, join?: "Round" | "Square" | "Miter"): Sketch
```

### `HermiteCurve3D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `p0` | `Vec3` | Start position |
| `p1` | `Vec3` | End position |
| `t0` | `Vec3` | Scaled tangent at start (direction * weight * chordLength) |
| `t1` | `Vec3` | Scaled tangent at end (direction * weight * chordLength) |
| `chordLength` | `number` | Chord length (straight-line distance between endpoints) |

**Methods:**

#### `pointAt()` — Evaluate position at parameter t ∈ [0, 1]

```ts
pointAt(t: number): Vec3
```

#### `tangentAt()` — Evaluate tangent (first derivative) at parameter t ∈ [0, 1]

```ts
tangentAt(t: number): Vec3
```

#### `curvatureAt()` — Evaluate curvature vector (second derivative) at parameter t ∈ [0, 1]

```ts
curvatureAt(t: number): Vec3
```

#### `sample()` — Sample the curve as a polyline of evenly-spaced parameter values.

```ts
sample(count?: number): Vec3[]
```

#### `length()` — Approximate arc length by sampling.

```ts
length(samples?: number): number
```

#### `sampleAdaptive()` — Sample with adaptive density — more points where curvature is higher. Returns at least `minCount` points, up to `maxCount`.

```ts
sampleAdaptive(minCount?: number, maxCount?: number): Vec3[]
```

#### `toPolyline()` — Convert to a format compatible with sweep() path input.

```ts
toPolyline(samples?: number): Vec3[]
```

### `QuinticHermiteCurve3D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `p0` | `Vec3` | Start position |
| `p1` | `Vec3` | End position |
| `t0` | `Vec3` | Scaled tangent at start (direction * weight * chordLength) |
| `t1` | `Vec3` | Scaled tangent at end (direction * weight * chordLength) |
| `c0` | `Vec3` | Scaled second derivative at start (curvature * weight² * chordLength²) |
| `c1` | `Vec3` | Scaled second derivative at end (curvature * weight² * chordLength²) |
| `chordLength` | `number` | Chord length (straight-line distance between endpoints) |

**Methods:**

#### `pointAt()` — Evaluate position at parameter t ∈ [0, 1]

```ts
pointAt(t: number): Vec3
```

#### `tangentAt()` — Evaluate tangent (first derivative, normalized) at parameter t ∈ [0, 1]

```ts
tangentAt(t: number): Vec3
```

#### `curvatureAt()` — Evaluate curvature vector (second derivative) at parameter t ∈ [0, 1]

```ts
curvatureAt(t: number): Vec3
```

#### `sample()` — Sample the curve as a polyline of evenly-spaced parameter values.

```ts
sample(count?: number): Vec3[]
```

#### `length()` — Approximate arc length by sampling.

```ts
length(samples?: number): number
```

#### `sampleAdaptive()` — Sample with adaptive density — more points where curvature is higher. Returns at least `minCount` points, up to `maxCount`.

```ts
sampleAdaptive(minCount?: number, maxCount?: number): Vec3[]
```

#### `toPolyline()` — Convert to a format compatible with sweep() path input.

```ts
toPolyline(samples?: number): Vec3[]
```

---

## Constants

### `Surface`

- `Nurbs(controlGrid: Vec3[][], options?: NurbsSurfaceOptions): Shape`
- `Ruled(curveA: ExactCurveInput, curveB: ExactCurveInput, options?: SurfaceCommonOptions): Shape`
- `Patch(curves: { bottom: ExactCurveInput; top: ExactCurveInput; left: ExactCurveInput; right: ExactCurveInput; }, options?: SurfacePatchOptions): Shape`
- `Boundary(input: SurfaceBoundaryInput): Shape`
- `Fill(input: SurfaceFillInput): Shape`
- `Sew(shapes: Shape[], options?: { tolerance?: number; }): Shape`
- `Extend(shape: Shape, options: SurfaceExtendOptions): Shape`
- `Trim(shape: Shape, tool: Shape | SurfacePlaneOp): Shape`
- `Split(shape: Shape, tool: Shape | SurfacePlaneOp): [ Shape, Shape ]`
- `Match(shape: Shape, options: { edge: "u0" | "u1" | "v0" | "v1"; target: EdgeRef; continuity?: SurfaceContinuity; }): Shape`
- `MatchEdge(shape: Shape, options: { edge: "u0" | "u1" | "v0" | "v1"; target: EdgeRef; continuity?: SurfaceContinuity; }): Shape`

### `Blend`

- `Edge(options: BlendEdgeOptions): Shape`
- `Surface(options: BlendSurfaceOptions): Shape`
- `CornerY(options: BlendCornerYOptions): Shape` — Current implementation uses continuity-controlled edge fillets on solid edges. It does not yet provide a dedicated open-sheet or multi-patch Y-corner solver. Follow progress: https://github.com/KoStard/forgecad-private/issues/162

### `Analysis`

- `EdgeContinuity(shape: Shape, options?: EdgeContinuityThresholds): EdgeContinuityReport`
- `SurfaceContinuity(shape: Shape, options?: EdgeContinuityThresholds): EdgeContinuityReport`
- `CurvatureComb(input: NurbsCurve3D | EdgeRef, options?: { samples?: number; }): CurvatureSample[]`
- `SurfaceHealth(shape: Shape, options?: { tinyEdgeThreshold?: number; sliverThreshold?: number; }): SurfaceHealthReport`

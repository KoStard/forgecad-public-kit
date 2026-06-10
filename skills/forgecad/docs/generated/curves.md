---
skill-group: curves
skill-order: 100
---

# Curves & Surfacing

Smooth curves, lofted surfaces, swept solids, splines, and high-level product skins.

## Contents

- [Curves & Surfacing](#curves-surfacing)
- [Surface Members](#surface-members)
- [Curve3D](#curve3d)
- [Route3D](#route3d)
- [NurbsCurve3D](#nurbscurve3d)
- [NurbsSurface](#nurbssurface)
- [PathBuilder](#pathbuilder) — Line Segments, Arcs, Curves, Closing & Output
- [ProductSkin](#productskin)
- [ProductSurfaceRef](#productsurfaceref)
- [ProductSurfaceBuilder](#productsurfacebuilder)
- [ProductSkinBuilder](#productskinbuilder)
- [ProductStationBuilder](#productstationbuilder)
- [ProductPanelBuilder](#productpanelbuilder)
- [ProductRibbonBuilder](#productribbonbuilder)
- [CylinderCarrier](#cylindercarrier)
- [PlaneCarrier](#planecarrier)
- [ProductSkinCarrier](#productskincarrier)
- [SurfacePath](#surfacepath)
- [SurfacePathBuilder](#surfacepathbuilder)
- [SurfaceBand](#surfaceband)
- [SurfaceBodyBuilder](#surfacebodybuilder)
- [SurfaceMemberBuilder](#surfacememberbuilder)
- [SurfaceJoinBuilder](#surfacejoinbuilder)
- [CounterboreBuilder](#counterborebuilder)
- [RoundedSlotBuilder](#roundedslotbuilder)
- [Curve](#curve)
- [Surface](#surface)
- [Blend](#blend)
- [Analysis](#analysis)
- [Product](#product)
- [Carrier](#carrier)
- [SurfaceMembers](#surfacemembers)

## Functions

### Curves & Surfacing

#### `Curve.Blend(start: CurveBlendEndpoint, end: CurveBlendEndpoint): NurbsCurve3D` — Create an exact G1 blend curve between two directed endpoints.

The returned curve is a cubic non-rational `NurbsCurve3D`: ForgeCAD converts the endpoint positions and tangents into Bezier control points, so the curve can feed `sweep` and exact surface boundaries through the existing `nurbs` IR rather than a sampled polyline.

```js
const rail = Curve.Blend(
  { point: [0, 0, 0], tangent: [1, 0, 0], weight: 0.8 },
  { point: [40, 20, 8], tangent: [0, 1, 0], weight: 0.8 },
);
const tube = sweep(circle2d(2), rail);
```

**`CurveBlendEndpoint`**
- `point: Vec3` — Endpoint position.
- `tangent: Vec3` — Tangent direction at this endpoint. Magnitude is ignored.
- `weight?: number` — Tangent reach relative to the endpoint chord length. Default 1.

#### `Curve.BlendG2(start: CurveBlendG2Endpoint, end: CurveBlendG2Endpoint): NurbsCurve3D` — Create an exact G2 blend curve between two directed endpoints.

This is the curvature-aware companion to `Curve.Blend()`. It returns a degree-5 non-rational `NurbsCurve3D` that matches endpoint position, tangent direction, and optional curvature/second-derivative vectors.

```js
const rail = Curve.BlendG2(
  { point: [0, 0, 0], tangent: [1, 0, 0], curvature: [0, 0.02, 0] },
  { point: [50, 20, 0], tangent: [0, 1, 0], curvature: [-0.02, 0, 0] },
);
```

**`CurveBlendG2Endpoint`** extends CurveBlendEndpoint
- `curvature?: Vec3` — Optional endpoint curvature/second-derivative vector. Default is zero.

#### `Curve.Arc(options: CurveArcOptions): NurbsCurve3D` — Create an exact circular 3D arc from start, end, and start tangent.

The returned curve is a rational quadratic `NurbsCurve3D`, split into stable spans when needed, so it can feed `sweep` without sampling the authoring intent away.

```js
const rail = Curve.Arc({
  start: [40, 0, 0],
  end: [0, 40, 0],
  tangent: [0, 1, 0],
});
const tube = sweep(circle2d(2), rail);
```

**`CurveArcOptions`**
- `start: Vec3` — Arc start point.
- `end: Vec3` — Arc end point.
- `tangent: Vec3` — Tangent direction at the start point. Magnitude is ignored.

#### `Curve.Line(start: Vec3, end: Vec3): NurbsCurve3D` — Create an exact straight 3D NURBS line segment.

```js
const rail = Curve.Line([0, 0, 0], [80, 0, 15]);
const rib = sweep(circle2d(2), rail);
```

#### `Curve.Nurbs(points: Vec3[], options?: NurbsCurve3DOptions): NurbsCurve3D` — Create an exact NURBS 3D curve from control points, weights, knots, and degree.

```js
const rail = Curve.Nurbs([[0, 0, 0], [30, 4, 12], [60, -4, 12], [90, 0, 0]]);
const tube = sweep(circle2d(2), rail);
```

**`NurbsCurve3DOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `degree?` | `number` | Polynomial degree (default 3 = cubic). Must be ≥ 1. |
| `weights?` | `number[]` | Rational weights, one per control point (default: all 1.0 = non-rational). |
| `knots?` | `number[]` | Knot vector (default: uniform clamped). Must have length = controlPoints.length + degree + 1. |
| `closed?` | `boolean` | Whether the curve is closed/periodic (default false). |

#### `Curve.Fit(points: Vec3[], options?: CurveFitOptions): NurbsCurve3D` — Fit a non-rational NURBS curve that interpolates every input point.

This is global B-spline interpolation, not approximate curve reduction: ForgeCAD computes chord-length parameters, averaged clamped knots, solves the control points, then verifies the interpolation residual against `tolerance`. With `{ closed: true }` the fit is standard periodic B-spline interpolation: the curve loops smoothly from the last point back to the first (do not repeat the first point at the end).

```js
const rail = Curve.Fit(
  [[0, 0, 0], [20, 8, 12], [50, -4, 18], [80, 0, 0]],
  { degree: 3, tolerance: 0.001 },
);
const tube = sweep(circle2d(2), rail);

// Closed loop through four points — no duplicated closing point
const loop = Curve.Fit(
  [[30, 0, 0], [0, 30, 0], [-30, 0, 0], [0, -30, 0]],
  { closed: true },
);
```

**`CurveFitOptions`**
- `degree?: number` — Polynomial degree. Default is cubic, reduced automatically for short point lists.
- `tolerance?: number` — Maximum allowed interpolation residual in model units. Default 1e-7.
- `closed?: boolean` — Interpolate a closed periodic loop through the points. The loop closes from the last point back to the first automatically — do not repeat the first point at the end.

#### `Curve.Trim<T extends CurveTrimInput>(curve: T, start: number, end: number): CurveTrimOutput<T>` — Extract an exact curve segment from normalized parameter `start` to `end`.

`NurbsCurve3D` inputs are trimmed with exact knot insertion/subdomain extraction. Polyline point arrays are trimmed by arclength over their exact line segments. Sampled `Curve3D` splines are rejected until ForgeCAD has a tolerance-controlled rebuild path.

#### `Curve.Reverse<T extends CurveTrimInput>(curve: T): CurveTrimOutput<T>` — Reverse an exact curve without changing its geometry.

`NurbsCurve3D` inputs reverse control points, weights, and knots. Polyline point arrays are cloned and reversed. Sampled `Curve3D` splines are rejected until ForgeCAD has a tolerance-controlled rebuild path.

#### `Curve.Route: typeof Route3D` — Build analytic 3D line/arc routes for sweeps.

`Curve.Route.fromPolyline()` is the canonical route API. It returns a `Route3D` value object, preserving exact route segments, named port frames, and the lowerable `route3d` sweep compile plan.

```js
const route = Curve.Route.fromPolyline(
  [[0, 0, 0], [0, 0, 50], [40, 0, 50]],
  { cornerRadius: 12, startPort: 'inlet', endPort: 'outlet' },
);
const tube = sweep(circle2d(4), route);
```

#### `Curve.Helix: { path(options: HelixOptions): CurveHelixPath; coil: CurveHelixCoil; }` — Build helical paths and swept coils.

`Curve.Helix` is the canonical namespace for helical paths and coils. It uses the same sweep-based lowering as other curve paths.

```js
const guide = Curve.Helix.path({ radius: 20, pitch: 6, turns: 4 });
const spring = Curve.Helix.coil({ radius: 20, pitch: 6, turns: 4, wireRadius: 1 });
```

**`HelixOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `radius` | `number` | Radius from the central Z axis to the helix centerline. |
| `pitch?` | `number` | Axial distance per full turn. Provide any two of `pitch`, `turns`, and `height`. |
| `turns?` | `number` | Number of full rotations around the axis. Provide any two of `pitch`, `turns`, and `height`. |
| `height?` | `number` | Total height along +Z. Provide any two of `pitch`, `turns`, and `height`. |
| `startAngle?` | `number` | Start angle in degrees. Default 0 starts on +X. |
| `clockwise?` | `boolean` | Reverse winding direction when viewed from +Z. |
| `samplesPerTurn?` | `number` | Point samples per turn for the metadata path. Default 32. |

`CurveHelixPath`: `{ radius: number, pitch: number, turns: number, height: number, startAngle: number, clockwise: boolean }`

#### `Loft.station(profile: Sketch, position: number): LoftStation` — Create a loft station from a 2D profile and an axis position.

`LoftStation`: `{ profile: Sketch, position: number }`

#### `Loft.field(profiles: Sketch[], heights: number[], options?: FieldLoftOptions): Shape` — Loft by interpolating signed-distance fields instead of matching vertices.

Use this path when profiles change character, such as round shafts blending into flat, cruciform, or lobed tips. It is Manifold-only, mesh-based, and slower than stitched lofting, but it avoids profile-point correspondence artifacts because it blends profile fields instead of boundary vertices.

**`LoftOptions`**
- `edgeLength?: number` — Marching-grid edge length for level-set meshing. Smaller = finer.
- `boundsPadding?: number` — Optional extra bounds padding.

**`FieldLoftOptions`** extends LoftOptions
- `simplify?: boolean | "safe"` — Simplification control after field extraction. Default is topology-safe simplification.
- `maxTriangles?: number` — Hard post-extraction triangle budget. Must be a positive integer. If safe simplification cannot reach it, the build fails.

#### `Loft.leftRail(path: LoftGuideRailPath): LoftGuideRail` — Create a guide rail that constrains the section-local negative-X side.

`LoftGuideRail`: `{ side: LoftGuideRailSide, path: LoftGuideRailPath }`

#### `Loft.rightRail(path: LoftGuideRailPath): LoftGuideRail` — Create a guide rail that constrains the section-local positive-X side.

#### `Loft.frontRail(path: LoftGuideRailPath): LoftGuideRail` — Create a guide rail that constrains the section-local positive-Y side.

#### `Loft.backRail(path: LoftGuideRailPath): LoftGuideRail` — Create a guide rail that constrains the section-local negative-Y side.

#### `Loft.centerRail(path: LoftGuideRailPath): LoftGuideRail` — Create a guide rail that moves section centers along the loft.

#### `Loft.pathOnXz(path: LoftPath2D, y?: number): Vec3[]` — Place a 2D guide path onto the XZ plane.

The path's first coordinate becomes X and its second coordinate becomes Z. Use this for left/right silhouette rails authored with [`path()`](/docs/sketch#path) or [`constrainedSketch()`](/docs/sketch#constrainedsketch).

#### `Loft.pathOnYz(path: LoftPath2D, x?: number): Vec3[]` — Place a 2D guide path onto the YZ plane.

The path's first coordinate becomes Y and its second coordinate becomes Z. Use this for front/back crown rails authored with [`path()`](/docs/sketch#path) or [`constrainedSketch()`](/docs/sketch#constrainedsketch).

#### `Loft.pathOnXy(path: LoftPath2D, z?: number): Vec3[]` — Place a 2D guide path onto the XY plane.

The path's first coordinate becomes X and its second coordinate becomes Y. Use this when lofting along X or Y and a rail lives in a horizontal sketch plane.

#### `Loft.withGuideRails(stations: LoftStation[], rails: LoftGuideRail[], options?: LoftWithGuideRailsOptions): Shape` — Loft through profile stations while forcing generated sections to follow guide rails.

Stations define the cross-section family. Guide rails define the side or center paths the loft must pass through. With opposite side rails, the section is scaled to touch both rails. With one side rail, the section keeps its interpolated size unless a center rail is also present.

**`LoftWithGuideRailsOptions`** extends LoftOptions
- `axis?: LoftAxis` — Primary station axis. Default Z.
- `samples?: number` — Number of generated loft stations including ends. Default scales with station count.
- `railSamples?: number` — Number of points sampled from curve-backed rails before axis interpolation. Default 64.

#### `spline2d(points: Vec2[], options?: Spline2DOptions): Sketch` — Build a smooth Catmull-Rom spline sketch from 2D control points.

A closed spline (default) returns a filled profile. An open spline requires a strokeWidth option to produce a solid sketch. Use tension (0..1, default 0.5) to control curve tightness.

**`Spline2DOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `closed?` | `boolean` | Closed loop (default true). |
| `tension?` | `number` | Catmull-Rom tension in [0, 1]. 0 = very round, 1 = linear-ish. Default 0.5. |
| `samplesPerSegment?` | `number` | Samples per segment (minimum 3). Default 16. |
| `strokeWidth?` | `number` | For open splines, provide stroke width to return a solid Sketch. If omitted for open splines, an error is thrown. |
| `join?` | `"Round" \| "Square"` | Stroke join for open splines. Default 'Round'. |

#### `loft(profiles: Sketch[], heights: number[], options?: LoftOptions): Shape` — Loft between multiple sketches along Z stations.

Profiles can differ in topology and vertex count: interpolation is done on signed-distance fields and meshed with level-set extraction. Heights must be strictly increasing. Compatible loft stacks can also stay on the maintained export-backend path.

The surface is smooth through 3+ stations (C1 spanwise interpolation, like CAD lofts), so it can bow slightly past the straight ruling between stations; sections are matched exactly at their stations. Two-station lofts are ruled. `edgeLength` caps the sample spacing in curved or twisted regions (quality presets scale it); straight regions keep input density.

Performance note: loft is significantly heavier than primitive/extrude/revolve. If the part is axis-symmetric (bottles, vases, knobs), prefer revolve().

#### `sweep(profile: Sketch, path: SweepPathInput, options?: SweepOptions): Shape`

**`SweepOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `samples?` | `number` | Number of samples when path is a Curve3D. Default 48. |
| `edgeLength?` | `number` | Marching-grid edge length for level-set meshing. Smaller = finer. |
| `boundsPadding?` | `number` | Optional extra bounds padding. |
| `up?` | `Vec3` | Preferred "up" vector for local profile frame. Auto fallback is used near parallel segments. |

#### `variableSweep(spine: SweepPathInput, sections: VariableSweepSection[], options?: VariableSweepOptions): Shape` — Sweep a variable cross-section along a 3D spine curve.

Unlike sweep(), which uses a single constant profile, variableSweep() interpolates between multiple profiles at different stations along the spine. This enables organic shapes like tapering tubes, bone-like structures, and sculptural forms.

Each section specifies a t parameter (0 = start, 1 = end of spine) and a 2D profile sketch. The SDF-based level-set mesher smoothly blends between profiles at intermediate positions.

Performance note: like sweep(), this uses level-set meshing internally.

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

### Surface Members

#### `surfaceBand<C extends SurfaceCoordinate>(path: SurfacePath<C> | SurfacePathBuilder<C>, width: WidthProfile, cap?: SurfaceBandCap): SurfaceBand<C>`

#### `SurfaceBody(name: string): SurfaceBodyBuilder` — Start a surface-member body builder for straps, inlays, guards, braces, cuffs, and similar physical members that live on a carrier surface.

```js
const carrier = Carrier.cylinder('guard-envelope').diameter(84).height(36).clearance(2);
const guard = SurfaceBody('simple-guard')
  .carrier(carrier)
  .member('left-strut')
  .band()
  .path(carrier.path().from({ angle: -132, z: 6 }).to({ angle: -58, z: 18 }))
  .section({ width: 5.5, thickness: 2.8, edgeRadius: 0.6 })
  .member('right-strut')
  .mirrorOf('left-strut')
  .member('front-hoop')
  .band()
  .path(carrier.path().around({ z: 18, fromAngle: -58, toAngle: 58 }))
  .section({ width: 6.2, thickness: 3, edgeRadius: 0.7 })
  .join('left-strut', 'front-hoop').blend({ radius: 3.2 })
  .join('right-strut', 'front-hoop').blend({ radius: 3.2 })
  .build();
```

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

#### `sampleBySegment(samplesPerSegment?: number): Vec3[]` — Sample the curve with a fixed number of points per segment.

#### `sample(count?: number): Vec3[]` — Sample the curve to an approximate total point count.

#### `pointAt(t: number): Vec3` — Return the position on the curve at normalized parameter `t` in `[0, 1]`. O(1), no allocations.

#### `tangentAt(t: number): Vec3` — Return a unit tangent vector at normalized parameter `t` in `[0, 1]`. O(1), analytical derivative.

#### `length(samples?: number): number` — Approximate the curve length by polyline sampling.

### `Route3D`

Metadata-bearing analytic 3D route made from line and arc segments.

Use `Curve.Route.fromPolyline()` when you know the virtual design skeleton points and bend radius. ForgeCAD computes tangent trim points, bend arcs, total length, and named start/end port frames. Pass the route directly to `sweep()`.

```js
const route = Curve.Route.fromPolyline(
  [[0, 0, 0], [0, 0, 80], [60, 0, 80]],
  { cornerRadius: 24, startPort: "inlet", endPort: "outlet" },
);
const pipe = sweep(difference2d(circle2d(8), circle2d(6)), route);
const outlet = route.port("outlet");
```

#### `static fromPolyline(points: Route3DVec3[], options?: Route3DFromPolylineOptions): Route3D` — Build a line/arc route from virtual polyline corner points.

**`Route3DFromPolylineOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `cornerRadius?` | `number` | Bend radius applied to every virtual interior corner. Default 0 keeps sharp polyline corners. |
| `startPort?` | `string` | Name for the start port. Default "start". |
| `endPort?` | `string` | Name for the end port. Default "end". |
| `up?` | `Vec3` | Preferred up vector for deterministic port frames. Default [0, 0, 1]. |

#### `get length(): number` — Total centerline length, including line and bend arc segments.

#### `get segments(): Route3DSegment[]` — Exact line and arc segments that make up this route.

#### `get ports(): Record<string, RoutePortFrame>` — Named port frames, keyed by port name.

#### `port(name: string): RoutePortFrame` — Return one named route port frame.

#### `toSweepPathPlan(): SweepPathCompilePlan` — Convert this route to the compile plan consumed by sweep().

#### `toPolyline(options?: number | Route3DToPolylineOptions): Route3DVec3[]` — Sample this analytic route as a polyline for inspection or backend lowering.

**`Route3DToPolylineOptions`**
- `samples?: number` — Approximate target point count for the full route.
- `maxAngleDeg?: number` — Maximum angular spacing on arc segments. Default 6 degrees.

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

#### `pointAt(t: number): Vec3` — Evaluate the curve at parameter t ∈ [0, 1]. Uses De Boor's algorithm — exact, O(degree²).

#### `tangentAt(t: number): Vec3` — Evaluate the unit tangent vector at parameter t ∈ [0, 1].

#### `sample(count?: number): Vec3[]` — Sample the curve uniformly at `count` points.

#### `sampleAdaptive(minCount?: number, maxCount?: number): Vec3[]` — Sample with adaptive density — more points in high-curvature regions.

#### `length(samples?: number): number` — Approximate arc length by summing polyline segment lengths.

#### `toPolyline(samples?: number): Vec3[]` — Convert to a format compatible with sweep() path input.

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
| `domain` | `SurfaceDomainCompilePlan` | — |

**Methods:**

#### `pointAt(u: number, v: number): Vec3` — Evaluate the surface at parameters (u, v) ∈ [0, 1]². Uses tensor product evaluation: evaluate basis functions in U and V independently.

#### `normalAt(u: number, v: number): Vec3` — Evaluate the surface normal at (u, v) via cross product of partial derivatives.

#### `tessellate(resU?: number, resV?: number): { positions: Vec3[]; normals: Vec3[]; indices: number[]; }` — Tessellate the surface into a triangle mesh. Returns positions, normals, and triangle indices.

### `PathBuilder`

**Line Segments**

#### `moveTo(x: number, y: number): this` — Move the cursor to an absolute position without drawing a segment.

When called after the initial [`path()`](/docs/sketch#path), this establishes the start of the outline. Calling `moveTo` again mid-path starts a new sub-path (hole in `close()`, separate segment for [`stroke()`](/docs/sketch#stroke)).

#### `lineTo(x: number, y: number): this` — Draw a straight line from the current cursor to an absolute position.

#### `lineH(dx: number): this` — Draw a horizontal line segment by `dx` units from the current cursor.

Positive `dx` moves right; negative moves left.

#### `lineV(dy: number): this` — Draw a vertical line segment by `dy` units from the current cursor.

Positive `dy` moves up; negative moves down.

#### `lineAngled(length: number, degrees: number): this` — Draw a line at the given angle and length from the current cursor.

Angle convention: `0°` points right (+X), `90°` points up (+Y).

```ts
// L-bracket with angled return
path().moveTo(0, 0).lineH(50).lineV(-70).lineAngled(20, 235).stroke(4);
```

**Arcs**

#### `arc(cx: number, cy: number, radius: number, startDeg: number, endDeg: number): this` — Draw an arc defined by center, radius, and angle range (no trig needed). If the path has no segments yet, automatically moves to the arc start. Positive sweep (startDeg < endDeg) = CCW, negative = CW.

```js
// Arc centered at (10, 0), radius 50, from -30° to +30°
path().arc(10, 0, 50, -30, 30).stroke(8, 'Round')
```

#### `arcTo(x: number, y: number, radius: number, clockwise?: boolean): this` — Draw a circular arc from the current position to (x, y) with the given radius. `clockwise=true` → arc curves to the right of the start→end direction. `clockwise=false` → arc curves to the left of the start→end direction.

#### `tangentArcTo(x: number, y: number): this` — G1-continuous arc — radius derived from current tangent + endpoint. Throws if endpoint is collinear with current direction.

**Curves**

#### `bezierTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this` — Cubic bezier from current position to (x, y) via two control points.

**Closing & Output**

#### `close(): Sketch` — Close the path and return a filled [`Sketch`](/docs/sketch#sketch).

The winding of the polygon is automatically corrected to CCW (the expected orientation for ForgeCAD sketches). If the path contains multiple sub-paths (started with subsequent `moveTo` calls), the first sub-path is the outer contour and subsequent sub-paths become holes subtracted from it.

Edge labels (assigned with `.label('name')`) are transferred to the resulting sketch and propagate through `extrude()`, `revolve()`, `loft()`, and `sweep()` into named faces on the resulting [`Shape`](/docs/core#shape).

```ts
const triangle = path().moveTo(0, 0).lineH(50).lineV(30).close();

// With a hole (second sub-path)
const frame = path()
  .moveTo(0, 0).lineH(40).lineV(30).lineH(-40).close(); // outer
  // (hole would be added with another moveTo and line sequence before close)
```

#### `closeLabel(name: string): Sketch` — Label the closing segment and close the path. Shorthand for labeling the implicit line from the last point back to the start, then closing.

#### `stroke(width: number, join?: "Round" | "Square"): Sketch` — Thicken an open polyline (centerline) into a solid filled profile with uniform width.

Expands the path into a closed profile `width` units wide (half-width on each side of the centerline). Use `'Round'` for ribs, wire traces, and organic profiles — it adds semicircular endcaps and rounds joins. Use `'Square'` (default) for sharp miter joins without endcaps.

Not the same as rounding corners of a closed polygon — for mixed sharp-and-rounded outlines, build the polygon first and apply `.filletCorner([x, y], radius)` per corner.

```ts
// Square-join L-bracket
const bracket = path().moveTo(0, 0).lineH(50).lineV(-70).lineAngled(20, 235).stroke(4);

// Round-join rib
const rib = path().moveTo(0, 0).lineH(60).stroke(6, 'Round');

// Equivalent standalone form
const wire = stroke([[0, 0], [50, 0], [50, -70]], 4);
```

and semicircular endcaps.

#### `label(name: string): this` — Label the most recently added segment. Labels are born here and grow into face names when the sketch is extruded, lofted, swept, or revolved.

Labels must be unique within a path. Each segment can have at most one label.

**Other**

#### `getX(): number` — Current cursor X position.

#### `getY(): number` — Current cursor Y position.

#### `lineBy(dx: number, dy: number): this` — Draw a line by a relative `(dx, dy)` displacement from the current cursor.

#### `arcBy(dx: number, dy: number, radius: number, clockwise?: boolean): this` — Draw an arc to a point offset from the current cursor.

#### `bezierBy(dcp1x: number, dcp1y: number, dcp2x: number, dcp2y: number, dx: number, dy: number): this` — Draw a cubic Bezier using control points relative to the current cursor.

#### `arcAround(cx: number, cy: number, sweepDeg: number): this` — Arc around a known center point, sweeping by the given angle. Radius is derived from the distance between the current position and the center. Positive sweep = CCW (math convention), negative = CW.

```js
// Arc 90° CCW around (50, 50)
path().moveTo(70, 50).arcAround(50, 50, 90)
// Arc 45° CW around the origin
path().moveTo(10, 0).arcAround(0, 0, -45)
```

#### `arcAroundRelative(dx: number, dy: number, sweepDeg: number): this` — Arc around a center point given as an offset from the current position. `(dx, dy)` is the vector from the current point to the center. Positive sweep = CCW (math convention), negative = CW.

```js
// Arc 90° CCW around a center 20 units to the right
path().moveTo(50, 50).arcAroundRelative(20, 0, 90)
// Equivalent to: path().moveTo(50, 50).arcAround(70, 50, 90)
```

#### `smoothCapTo(endX: number, endY: number, cornerRadius: number, capRadius: number): this` — Smooth three-arc end cap from the current position to (endX, endY). Inserts: small corner arc → large cap arc → small corner arc, all G1-continuous.

#### `tangentBezierTo(cp2x: number, cp2y: number, x: number, y: number, weight?: number): this` — G1-continuous cubic bezier — first control point is auto-derived from the current tangent direction. `weight` controls how far the auto-placed control point extends along the tangent (default: 1/3 of the chord).

The second control point `(cp2x, cp2y)` must be provided — it controls the arrival curvature. For a fully automatic smooth curve, see `smoothThrough`.

#### `smoothThrough(waypoints: Vec2[], tension?: number): this` — Catmull-Rom spline through a list of waypoints from the current position. The current position is included as the first point. The last waypoint becomes the new cursor position.

#### `nurbsTo(controlPoints: Vec2[], opts?: { weights?: number[]; degree?: number; }): this` — Rational B-spline edge to (x, y) with explicit control points and weights.

The control points define the B-spline shape between the current position and (x, y). The current position is NOT included in `controlPoints` — it is automatically prepended. The endpoint (x, y) is the last control point.

#### `exactArcTo(x: number, y: number, opts?: { radius?: number; clockwise?: boolean; }): this` — Exact circular arc to (x, y) using a rational quadratic NURBS.

Unlike `arcTo()` which tessellates to a polyline, this preserves the exact arc definition. When extruded through the OCCT backend, it produces a true cylindrical face — not a faceted approximation.

#### `fillet(radius: number): this` — Round the last corner (the junction between the previous two segments) with a tangent arc of the given radius.

Must be called after at least two line/arc segments that form a corner. The fillet trims back both segments and inserts a tangent arc.

```js
path().moveTo(0,0).lineTo(10,0).lineTo(10,10).fillet(2).lineTo(0,10).close()
```

#### `chamfer(distance: number): this` — Chamfer the last corner with a straight cut of the given distance.

```js
path().moveTo(0,0).lineTo(10,0).lineTo(10,10).chamfer(2).lineTo(0,10).close()
```

#### `mirror(axis: "x" | "y" | Vec2): this` — Mirror all existing segments across an axis and append the mirrored copy in reverse order, creating a symmetric path. The axis passes through the current cursor position.

'y' mirrors across the local Y-axis (flips X), or `[nx, ny]` for an arbitrary axis direction.

```js
// Build right half, mirror to get full symmetric profile
path().moveTo(0,0).lineTo(10,0).lineTo(10,5).mirror('x').close()
```

#### `toPolyline(): Vec2[]` — Return the open path as a sampled 2D polyline.

This is for construction geometry such as guide rails, measured centerlines, and curve-driven helpers where the authored path should stay open instead of becoming a filled sketch or stroked profile.

```ts
const rail = path()
  .moveTo(24, 0)
  .bezierTo(32, 44, 28, 92, 18, 120)
  .toPolyline();
```

#### `closeOffset(delta: number, join?: "Round" | "Square" | "Miter"): Sketch` — Close the path and return an offset version of the filled Sketch. Positive delta expands outward, negative shrinks inward.

### `ProductSkin`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `shape` | `Shape` | — |
| `axis` | `ProductSkinAxis` | — |
| `stations` | `ProductStationSpec[]` | — |
| `rails` | `Record<string, ProductRailSpec>` | — |

**Methods:**

#### `toShape(): Shape` — Return the renderable shape generated for this product skin.

#### `with(...children: GroupInput[]): ShapeGroup` — Create a group containing this skin plus named child details.

#### `integrate(...details: Shape[]): Shape` — Boolean-union structural details into the skin body.

#### `uv(side: ProductSkinSide, u?: number, v?: number): ProductSkinRefQuery` — Create a side/u/v surface-ref query on this skin.

**`ProductSkinSide`** — Semantic side of a ProductSkin. `back` is accepted as an alias for `rear`.

`"left" | "right" | "top" | "bottom" | "front" | "rear" | "back"`

**`ProductSkinRefQuery`**

| Option | Type | Description |
|--------|------|-------------|
| `side` | `ProductSkinSide` | Side of the product skin. `front` is the minimum axis cap, `rear`/`back` is the maximum axis cap. |
| `u?` | `number` | Across-side parameter for side refs. Defaults to 0.5. |
| `v?` | `number` | Along-axis parameter, 0 at the first cap and 1 at the rear/back cap. Defaults to 0.5. |
| `offset?` | `number` | Positive distance away from the surface along the resolved normal. |

#### `ref(name: string): ProductSurfaceRef` — Resolve a named ref published with Product.skin().refs(...).

#### `curveOnSurface(name: string, points: Array<Partial<ProductSkinRefQuery> & { side: ProductSkinSide; }>): ProductSurfaceRef[]` — Create a sampled curve as a sequence of surface refs on this skin.

#### `surface(side: ProductSkinSide): ProductSurfaceBuilder` — Create a fluent surface helper for refs and conformal features on one side of this skin.

Use this when several refs or ribbons share the same skin side; side-local helpers keep path points concise and make it harder to mix sides accidentally.

#### `stationAt(vOrAxis: number): { ... }` — Interpolate center, width, and depth at a normalized v or absolute axis value.

**`ProductProfileKind`**

`"oval" | "roundedRect" | "circle" | "superEllipse" | "custom"`

#### `frame(query: ProductSkinRefQuery): ProductSurfaceFrame` — Build a local surface frame from a side/u/v query.

`ProductSurfaceFrame`: `{ point: Vec3, normal: Vec3, tangentU: Vec3, tangentV: Vec3, matrix: Mat4, skin: string }`

### `ProductSurfaceRef`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string \| undefined` | — |

**Methods:**

#### `frame(overrides?: Partial<ProductSkinRefQuery>): ProductSurfaceFrame` — Resolve this semantic surface ref into a point, normal, tangents, and placement matrix.

#### `with(overrides: Partial<ProductSkinRefQuery>): ProductSurfaceRef` — Return a copy of this ref with side/u/v/offset overrides.

#### `attach(detail: Shape | ShapeGroup, options?: ProductAttachOptions): Shape | ShapeGroup` — Place a detail shape or group on this ref's local surface frame.

`ProductAttachOptions`: `{ offset?: number, inset?: number }`

#### `querySpec(): ProductSkinRefQuery` — Return the serializable side/u/v query behind this ref.

### `ProductSurfaceBuilder`

Fluent helper bound to one ProductSkin side for refs and side-local conformal features.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `side` | `ProductSkinSide` | — |

**Methods:**

#### `ref(u?: number, v?: number, offset?: number): ProductSurfaceRef` — Create a ref on this skin side.

#### `uv(u?: number, v?: number, offset?: number): ProductSkinRefQuery` — Create a side/u/v query on this skin side.

#### `frame(query?: Partial<ProductSkinRefQuery>): ProductSurfaceFrame` — Resolve a point/frame on this surface using the builder's side.

#### `ribbon(name: string, points: ProductSurfacePathPoint[], options?: ProductRibbonBuildOptions): ProductRibbonBuilder` — Start a conformal ribbon on this skin side.

Path points use side-local `u`/`v` coordinates; this builder supplies the side. The returned ProductRibbonBuilder is already bound to the source skin and can be further configured before build(). Use `widthSamples` >= 3 when the ribbon must visibly wrap over curved product sections instead of behaving like a flat strip.

**`ProductSurfacePathPoint`** — Side-local path point for Product.surface(side).ribbon(...); the surface helper supplies `side`.
- `u?: number` — Across-side parameter on the bound side. Defaults to 0.5.
- `v?: number` — Along-axis parameter, 0 at the first cap and 1 at the rear/back cap. Defaults to 0.5.
- `offset?: number` — Positive distance away from the surface along the resolved normal.

**`ProductRibbonBuildOptions`** — Options shared by Product.ribbon() builders and Product.surface(...).ribbon(...).

| Option | Type | Description |
|--------|------|-------------|
| `width?` | `number` | Width across the surface in millimeters. |
| `thickness?` | `number` | Solid thickness outward from the source surface in millimeters. |
| `offset?` | `number` | Positive clearance between the source surface and the ribbon's inner face. |
| `samples?` | `number` | Samples along the ribbon path. Higher values bend more smoothly. |
| `widthSamples?` | `number` | Samples across the ribbon width. Use 3+ to visibly wrap over curved cross-sections. |
| `resolution?` | `number` | Tessellation resolution passed to the lowered NURBS surface. |
| `material?` | `ProductMaterial` | Apply a product material preset to the ribbon. |
| `color?` | `string` | Apply a simple color override. |

`ProductMaterial`: `{ color?: string, material?: ShapeMaterialProps }`

`ShapeMaterialProps` — defined in [core](/docs/core).

### `ProductSkinBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `axis(axis: ProductSkinAxis): this` — Choose the primary station axis for the skin loft.

**`ProductSkinAxis`** — Primary world axis used to order ProductSkin loft stations.

`"X" | "Y" | "Z"`

#### `stations(stations: Array<ProductStationBuilder | ProductStationSpec>): this` — Set named cross-section stations for the product skin.

`ProductStationSpec`: `{ name: string, center: Vec3, profile: ProductStationProfile, crown?: number }`

`ProductStationProfile`: `{ sketch: Sketch, width: number, depth: number, kind: ProductProfileKind, radius?: number, exponent?: number }`

#### `rails(rails: Record<string, ProductRailSpec>): this` — Attach named guide rails for product-skin construction and downstream surface references.

`ProductRailSpec`: `{ kind: ProductRailKind, points: Vec3[], degree?: number, name?: string }`

**`ProductRailKind`**

`"bezier" | "nurbs" | "polyline"`

#### `ref(name: string, query: ProductSkinRefQuery): this` — Publish a named semantic surface ref on the skin.

#### `refs(refs: Record<string, ProductSkinRefQuery>): this` — Publish multiple named semantic surface refs on the skin.

#### `uv(side: ProductSkinSide, u?: number, v?: number): ProductSkinRefQuery` — Create a side/u/v surface-ref query for use in refs(...) or Product.ref(...).

#### `material(material: ProductMaterial): this` — Apply a product material preset to the lowered skin.

#### `color(color: string): this` — Apply a simple color override to the lowered skin.

#### `edgeLength(value: number): this` — Set the sampled loft target edge length.

#### `wall(thickness: number): this` — Record intended wall thickness for product design metadata. Use explicit shelling when the model needs real inner-wall geometry.

#### `build(): ProductSkin` — Lower stations and refs into a ProductSkin body.

### `ProductStationBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `at(point: Vec3): this` — Position this station in world coordinates.

#### `z(z: number): this` — Convenience for traditional Z-up section stacks.

#### `y(y: number): this` — Convenience for product bodies running front-to-back along Y.

#### `x(x: number): this` — Convenience for product bodies running left-to-right along X.

#### `oval(width: number, depth: number, options?: { segments?: number; }): this` — Use an oval cross-section with full width and depth dimensions.

#### `superEllipse(width: number, depth: number, options?: ProductStationSuperEllipseOptions): this` — Use a superellipse cross-section for soft-square product surfaces.

`ProductStationSuperEllipseOptions`: `{ segments?: number, exponent?: number }`

#### `roundedRect(width: number, depth: number, radius: number): this` — Use a rounded-rectangle cross-section with the given corner radius.

#### `circle(diameter: number, options?: { segments?: number; }): this` — Use a circular cross-section from a full diameter.

#### `custom(sketch: Sketch, width: number, depth: number): this` — Use a custom 2D sketch as the station cross-section.

#### `crown(amount: number): this` — Set the station crown amount for soft product-section intent.

#### `toSpec(): ProductStationSpec` — Return the immutable station spec consumed by Product.skin().

### `ProductPanelBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `rounded(width: number, height: number, radius?: number): this` — Use a rounded rectangle panel profile.

#### `oval(width: number, height: number): this` — Use an oval panel profile.

#### `profile(profile: Sketch): this` — Use a custom 2D panel profile.

#### `thickness(thickness: number): this` — Set panel extrusion thickness.

#### `material(material: ProductMaterial): this` — Apply a product material preset to the panel.

#### `color(color: string): this` — Apply a simple color override to the panel.

#### `build(): Shape` — Build the panel in local coordinates.

#### `attachTo(ref: ProductRefInput, options?: ProductPanelAttachOptions): Shape` — Build and attach this panel to a ProductSurfaceRef.

**`ProductRefInput`**

`ProductSurfaceRef`

`ProductPanelAttachOptions`: `{ at?: Partial<ProductSkinRefQuery>, thickness?: number, material?: ProductMaterial, color?: string }`

### `ProductRibbonBuilder`

Builder for thin trim, label, grip, and split-line features that bend with a ProductSkin surface.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `on(skin: ProductSkin, points: ProductRibbonPathPoint[], options?: ProductRibbonBuildOptions): this` — Follow a ProductSkin with side/u/v path queries or refs.

This is the highest-fidelity mode because every interpolated sample is resolved through ProductSkin.frame(), so the ribbon bends along the selected side as station width/depth changes. All query path points must stay on one side; split side transitions into separate ribbons.

**`ProductRibbonPathPoint`** — Path point for Product.ribbon().on(...): either a side/u/v query or a resolved surface ref.

`ProductSkinRefQuery | ProductSurfaceRef`

#### `fromRefs(points: ProductSurfaceRef[], options?: ProductRibbonBuildOptions): this` — Follow explicit surface refs.

Useful for named refs or paths assembled elsewhere. The builder resolves each ref frame and interpolates between those frames; use on(skin, points) when you need full skin-side sampling between sparse control points.

#### `width(width: number): this` — Set ribbon width in millimeters.

#### `thickness(thickness: number): this` — Set solid thickness outward from the source surface in millimeters.

#### `offset(offset: number): this` — Set positive clearance between the source surface and the ribbon's inner face.

#### `samples(samples: number): this` — Set samples along the path.

#### `widthSamples(samples: number): this` — Set samples across the width. Use 3+ to bend over curved cross-sections.

#### `resolution(resolution: number): this` — Set NURBS tessellation resolution.

#### `material(material: ProductMaterial): this` — Apply a product material preset.

#### `color(color: string): this` — Apply a simple color override.

#### `build(options?: ProductRibbonBuildOptions): Shape` — Build a conformal ribbon as a thin NURBS surface solid.

### `CylinderCarrier`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `kind` | `"cylinder"` | — |

**Methods:**

- `diameter(value: number): this`
- `radius(value: number): this`
- `height(value: number): this`
- `clearance(value: number): this`
- `center(point: Vec3): this`
- `path(): SurfacePathBuilder<CylinderSurfaceCoordinate>`
- `anchor(angle: number, z?: number, options?: { offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `front(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `back(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `left(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `right(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `top(options?: { angle?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `bottom(options?: { angle?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>`
- `pointAt(coordinate: CylinderSurfaceCoordinate): Vec3`
- `mirrorPoint(point: Vec3): Vec3`
- `normalAt(coordinate: CylinderSurfaceCoordinate): Vec3`
- `tangentAt(coordinate: CylinderSurfaceCoordinate, tangentHint?: Vec3): Vec3`
- `frameAt(coordinate: CylinderSurfaceCoordinate, tangentHint?: Vec3): SurfaceFrame`
- `bounds(): SurfaceBounds`
- `offset(distance: number): CylinderCarrier`
- `mirrorCoordinate(coordinate: CylinderSurfaceCoordinate): CylinderSurfaceCoordinate`
- `radiusValueWithClearance(): number`

`CylinderSurfaceCoordinate`: `{ kind?: "cylinder", angle: number, z: number, offset?: number }`

### `PlaneCarrier`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `kind` | `"plane"` | — |

**Methods:**

- `size(width: number, height: number): this`
- `origin(point: Vec3): this`
- `normal(normal: Vec3): this`
- `path(): SurfacePathBuilder<PlaneSurfaceCoordinate>`
- `anchor(x?: number, y?: number, options?: { offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>`
- `left(options?: { y?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>`
- `right(options?: { y?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>`
- `top(options?: { x?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>`
- `bottom(options?: { x?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>`
- `pointAt(coordinate: PlaneSurfaceCoordinate): Vec3`
- `mirrorPoint(point: Vec3): Vec3`
- `normalAt(): Vec3`
- `tangentAt(coordinate: PlaneSurfaceCoordinate, tangentHint?: Vec3): Vec3`
- `frameAt(coordinate: PlaneSurfaceCoordinate, tangentHint?: Vec3): SurfaceFrame`
- `bounds(): SurfaceBounds`
- `offset(distance: number): PlaneCarrier`
- `mirrorCoordinate(coordinate: PlaneSurfaceCoordinate): PlaneSurfaceCoordinate`

`PlaneSurfaceCoordinate`: `{ kind?: "plane", x: number, y: number, offset?: number }`

### `ProductSkinCarrier`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `skin` | `ProductSkin` | — |
| `name` | `string` | — |
| `kind` | `"productSkin"` | — |

**Methods:**

#### `sideTransition(fromSide: ProductSkinSide, toSide: ProductSkinSide, input?: ProductSkinSideTransitionInput): ProductSkinSideTransition` — Return matching side-local coordinates for an explicit split-member transition.

Each SurfacePath still stays on one ProductSkin side. Use this helper to create one member ending on `from`, another starting on `to`, then join named anchors.

Rules: only adjacent `left`/`top`/`right`/`bottom` sides are supported — for front/rear caps use `Product.panel()`. `v` is normalized 0–1 along the shared boundary (default 0.5); `name` must be non-empty when provided; `offset` lifts both coordinates off the surface. Throws if the returned boundary coordinates are not physically coincident — check side order, `v`, and `offset`.

`ProductSkinSideTransitionInput`: `{ name?: string, v?: number, offset?: number }`

`ProductSkinSideTransition`: `{ name?: string, from: ProductSkinSurfaceCoordinate, to: ProductSkinSurfaceCoordinate }`

`ProductSkinSurfaceCoordinate`: `{ kind?: "productSkin", side?: ProductSkinSide, u?: number, v?: number, offset?: number }`

#### `sideTransitionChain(sides: ProductSkinSide[], input?: ProductSkinSideTransitionInput): ProductSkinSideTransition[]` — Return a sequence of matching side-local coordinates for an explicit multi-side split-member route.

Each adjacent side pair becomes one named transition. Build one member per side segment, add transition anchors at each returned pair, then join the anchors. The same validation as `sideTransition()` applies to every adjacent pair.

#### `sideRoute(input: ProductSkinSideRouteInput): ProductSkinSideRoute` — Return side-local member segments for a generated multi-side split-member route.

The route still compiles as explicit members plus named-anchor joins. This helper only generates the per-side segment endpoints and transition names.

**`ProductSkinSideRouteInput`**: `name?: string`, `sides: ProductSkinSide[]`, `from: ProductSkinSurfaceCoordinate`, `to: ProductSkinSurfaceCoordinate`, `v?: number`, `offset?: number`

`ProductSkinSideRoute`: `{ name?: string, transitions: ProductSkinSideTransition[], segments: ProductSkinSideRouteSegment[] }`

**`ProductSkinSideRouteSegment`**: `name: string`, `side: ProductSkinSide`, `from: ProductSkinSurfaceCoordinate`, `to: ProductSkinSurfaceCoordinate`, `startAnchorName?: string`, `endAnchorName?: string`

- `surface(side: ProductSkinSide): ProductSkinCarrier`
- `path(): SurfacePathBuilder<ProductSkinSurfaceCoordinate>`
- `pointAt(coordinate: ProductSkinSurfaceCoordinate): Vec3`
- `mirrorPoint(point: Vec3): Vec3`
- `normalAt(coordinate: ProductSkinSurfaceCoordinate): Vec3`
- `tangentAt(coordinate: ProductSkinSurfaceCoordinate, tangentHint?: Vec3): Vec3`
- `frameAt(coordinate: ProductSkinSurfaceCoordinate, tangentHint?: Vec3): SurfaceFrame`
- `bounds(): SurfaceBounds`
- `offset(distance: number): ProductSkinCarrier`
- `mirrorCoordinate(coordinate: ProductSkinSurfaceCoordinate): ProductSkinSurfaceCoordinate`

### `SurfacePath`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `carrier` | `CarrierSurface<C>` | — |
| `points` | `C[]` | — |
| `closedValue` | `boolean` | — |

**Methods:**

- `closed(): SurfacePath<C>`
- `mirror(): SurfacePath<C>`
- `coordinateAt(t: number): C`
- `sample(count?: number): SurfacePathSample<C>[]`
- `length(samples?: number): number`

### `SurfacePathBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `carrier` | `CarrierSurface<C>` | — |

**Methods:**

- `from(coordinate: C): this`
- `through(coordinate: C): this`
- `to(coordinate: C): this`
- `around(input: { z: number; fromAngle: number; toAngle: number; offset?: number; }): this`
- `closed(): this`
- `mirror(): SurfacePath<C>`
- `build(): SurfacePath<C>`
- `sample(count?: number): SurfacePathSample<C>[]`

### `SurfaceBand`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `centerPath` | `SurfacePath<C>` | — |
| `widthProfile` | `WidthProfile` | — |
| `capStyle` | `SurfaceBandCap` | — |

**Methods:**

#### `withHole(name: string, input: SurfaceBandHoleInput): SurfaceBand<C>` — Return a new band with a named member-local rounded-slot hole region recorded as inspectable intent.

`SurfaceBandHoleInput`: `{ length: number, width: number, along?: number, across?: number }`

#### `holes(): SurfaceBandHoleRegion[]` — Resolve recorded hole regions into member-local across/along loops.

- `widthAt(t: number): number`
- `boundaries(samples?: number): SurfaceBandBoundarySample[]`

### `SurfaceBodyBuilder`

Builder for a named surface-member body. Owns named members — `band()` or `plate()` — and the joins between them. Features (slots, cutouts, lips, cups, ribs) attach to a member's local coordinate system before lowering; this is not a global boolean recipe.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `join(from: string, to: string | string[]): SurfaceJoinBuilder` — Declare a join between named members. Only a limited join set lowers to real geometry: close endpoint pairs, selected named-anchor pairs (`.betweenAnchors()`), and sampled band/plate landing pads. Farther, missing-anchor, or ambiguous joins remain diagnostic-only intent — decompose the design into supported joins instead of expecting a fallback.

#### `autoJoinAtSharedAnchors(): this` — Lower only unambiguous shared-endpoint pairs (exactly two members sharing a point) into junction geometry. Shared points with more than two members produce a warning diagnostic — declare explicit `.join(...)` relationships instead.

#### `build(): Shape | ShapeGroup` — Build and return only the member + junction geometry. Use `buildWithDiagnostics()` for the member graph and diagnostic codes.

- `carrier(carrier: CarrierSurface): this`
- `member(name: string): SurfaceMemberBuilder`

`CarrierSurface`: `{ name: string, kind: SurfaceCarrierKind }`

### `SurfaceMemberBuilder`

#### `anchorAt(name: string, coordinate: C | SurfaceAnchor<C>): this` — Add a named anchor at a carrier surface coordinate for explicit member joins.

`SurfaceAnchor`: `{ carrier: CarrierSurface<C>, coordinate: C }`

- `plate(): this`
- `band(): this`
- `at(anchor: SurfaceAnchor<C>): this`
- `size(width: number, height: number): this`
- `path(path: SurfacePath<C> | SurfacePathBuilder<C>): this`
- `section(section: MemberSectionInput): this`
- `cap(style: SurfaceBandCap): this`
- `slot(name: string, feature: MemberFeature | RoundedSlotBuilder): this`
- `cutout(name: string, feature: MemberFeature | RoundedSlotBuilder): this`
- `counterbore(name: string, feature: MemberFeature | CounterboreBuilder): this`
- `features(features: MemberFeature | MemberFeature[]): this`
- `profile(name: string, options?: { depth?: number; height?: number; }): this`
- `mirrorOf(memberName: string): SurfaceBodyBuilder`
- `member(name: string): SurfaceMemberBuilder`
- `join(from: string, to: string | string[]): SurfaceJoinBuilder`
- `autoJoinAtSharedAnchors(): SurfaceBodyBuilder`
- `build(): Shape | ShapeGroup`

**`MemberSectionInput`**: `width?: number`, `thickness: number`, `edgeRadius?: number`, `direction?: MemberOutwardDirection`, `material?: ProductMaterial`, `stations?: MemberSectionStation[]`

`MemberSectionStation`: `{ t: number, width?: number, thickness?: number }`

**`MemberFeature`**: `type: MemberFeatureType`, `name?: string`, `length?: number`, `width?: number`, `diameter?: number`, `counterboreDiameter?: number`, `clearanceDiameter?: number`, `height?: number`, `depth?: number`, `count?: number`, `along?: number`, `across?: number`, `verticalTravel?: number`

### `SurfaceJoinBuilder`

#### `betweenAnchors(fromAnchor: string, toAnchor: string): this` — Select named anchors on the source and target members before lowering this join.

- `blend(input?: { radius?: number; style?: string; priority?: number; continuity?: string; }): SurfaceBodyBuilder`

### `CounterboreBuilder`

- `at(input: { along?: number; across?: number; z?: number; }): this`
- `named(name: string): MemberFeature`
- `toFeature(name?: string): MemberFeature`

### `RoundedSlotBuilder`

- `verticalTravel(value: number): this`
- `at(input: { along?: number; across?: number; z?: number; }): this`
- `named(name: string): MemberFeature`
- `toFeature(name?: string): MemberFeature`

---

## Constants

### `Curve`

Canonical exact/smooth 3D curve constructors.

`Curve.*` is the public home for reference curves and route centerlines that feed `sweep`, `variableSweep`, route visualization, and future path consumers. Standalone 3D curve constructors have been collapsed into this namespace.

Members (full entries under [Curves & Surfacing](#curves-surfacing)): `Curve.Blend`, `Curve.BlendG2`, `Curve.Arc`, `Curve.Line`, `Curve.Nurbs`, `Curve.Fit`, `Curve.Trim`, `Curve.Reverse`, `Curve.Route`, `Curve.Helix`.

### `Surface`

- `Plane(options: SurfacePlaneOptions): Shape` — Create a finite analytic plane sheet that can be trimmed, sewn, thickened, or used as a low-level face.
- `Cylinder(options: SurfaceCylinderOptions): Shape` — Create a finite analytic cylindrical sheet, optionally bounded by start/end angles.
- `Cone(options: SurfaceConeOptions): Shape` — Create a finite analytic conical or frustum sheet, optionally bounded by start/end angles.
- `Sphere(options: SurfaceSphereOptions): Shape` — Create a finite analytic spherical sheet bounded by longitude and latitude ranges.
- `Torus(options: SurfaceTorusOptions): Shape` — Create a finite analytic torus sheet bounded by major and tube angle ranges.
- `Nurbs(controlGrid: Vec3[][], options?: NurbsSurfaceOptions): Shape` — Create an exact NURBS surface from a grid of control points.

  The control grid is indexed as `controlGrid[u][v]` — each row is a curve in the V direction, and columns trace curves in the U direction. With default options this builds a bicubic non-rational B-spline sheet with uniform clamped knots; `NurbsSurfaceOptions` controls degrees, weights, knots, trim loops, tessellation, domain, and an optional `thickness` to return a thin solid instead of an open sheet.

  ```js
  // Simple 4×4 control grid — a gently curved surface
  const grid = [
    [[0,0,0], [10,0,2], [20,0,2], [30,0,0]],
    [[0,10,1], [10,10,5], [20,10,5], [30,10,1]],
    [[0,20,1], [10,20,5], [20,20,5], [30,20,1]],
    [[0,30,0], [10,30,2], [20,30,2], [30,30,0]],
  ];
  const sheet = Surface.Nurbs(grid);
  const panel = Surface.Nurbs(grid, { thickness: 2 });
  ```
- `Ruled(curveA: ExactCurveInput, curveB: ExactCurveInput, options?: SurfaceCommonOptions): Shape`
- `Patch(curves: { bottom: ExactCurveInput; top: ExactCurveInput; left: ExactCurveInput; right: ExactCurveInput; }, options?: SurfacePatchOptions): Shape` — Create a smooth open surface sheet from 4 boundary curves (Coons patch).

  The four curves form the boundary of a quadrilateral patch and should meet at corners (small gaps are tolerated). Boundaries are exact by default: pass `NurbsCurve3D` values or `Shape.edge()` refs, or set `{ approximate: true }` to accept sampled `Curve3D`/`Vec3[]` boundaries. The result is an open sheet — call `.thicken(t)` for a thin solid.

  ```js
  const sheet = Surface.Patch({ bottom, top, left, right });
  const panel = Surface.Patch({ bottom, top, left, right }).thicken(1.5);
  ```
- `Boundary(input: SurfaceBoundaryInput): Shape`
- `Fill(input: SurfaceFillInput): Shape`
- `Sew(shapes: Shape[], options?: { tolerance?: number; }): Shape`
- `Solid(input: Shape | Shape[], options?: SurfaceSolidOptions): Shape` — Sew surface faces or consume an existing sewn shell and make a solid B-rep.
- `Extend(shape: Shape, options: SurfaceExtendOptions): Shape`
- `Trim(shape: Shape, tool: Shape | SurfacePlaneOp): Shape`
- `Split(shape: Shape, tool: Shape | SurfacePlaneOp): [ Shape, Shape ]`
- `Match(shape: Shape, options: { edge: "u0" | "u1" | "v0" | "v1"; target: EdgeRef; continuity?: SurfaceContinuity; }): Shape`

### `Blend`

- `Edge(options: BlendEdgeOptions): Shape`
- `Surface(options: BlendSurfaceOptions): Shape`

### `Analysis`

- `EdgeContinuity(shape: Shape, options?: EdgeContinuityThresholds): EdgeContinuityReport`
- `SurfaceContinuity(shape: Shape, options?: EdgeContinuityThresholds): EdgeContinuityReport`
- `CurvatureComb(input: NurbsCurve3D | EdgeRef, options?: { samples?: number; }): CurvatureSample[]`
- `SurfaceHealth(shape: Shape, options?: { tinyEdgeThreshold?: number; sliverThreshold?: number; }): SurfaceHealthReport`
- `BRepValidity(shape: Shape, options?: BRepValidityOptions): BRepValidityReport` — Validate B-rep/shell/solid structure and return closedness, manifoldness, orientation, and issue diagnostics.

### `Product`

- `skin(name: string): ProductSkinBuilder` — Start a named product skin builder.
- `station(name: string): ProductStationBuilder` — Start a named cross-section station for Product.skin(...).stations(...).
- `rail: { ... }` — Namespaced rail builders for product skin guide rails and handle spines.
- `profiles: { ... }` — Product profile helper namespace: oval, superEllipse, roundedRect, and circle — for stations, panels, trims, and openings.
- `materials: { ... }` — Namespaced product material presets for molded plastic, rubber, metal, and transparent parts.
- `applyMaterial(shape: Shape, preset: ProductMaterial | undefined): Shape` — Apply a product material preset to a Shape.
- `scenePreset(name: ProductScenePreset): void` — Apply an opinionated scene preset for product review renders.
- `profileSize(sketch: Sketch): { width: number; depth: number; }` — Measure the width and depth of a 2D profile sketch.
- `describeProfile(sketch: Sketch, kind?: ProductProfileKind, radius?: number): ProductProfileDescriptor` — Describe a custom sketch as a product profile.
- `scaleProfileTo(sketch: Sketch, width: number, depth: number): Sketch` — Scale an existing profile sketch to a target width/depth.
- `ref(skin: ProductSkin, query: ProductSkinRefQuery): ProductSurfaceRef` — Create an ad-hoc ProductSurfaceRef from a skin and side/u/v query.
- `surface(skin: ProductSkin, side: ProductSkinSide): ProductSurfaceBuilder` — Create a fluent surface helper for refs and conformal features on one side of a skin.

  Equivalent to skin.surface(side), useful when writing in Product.* namespace style.
- `panel(name: string): ProductPanelBuilder` — Start a panel feature builder.
- `ribbon(name: string): ProductRibbonBuilder` — Start a conformal ribbon/trim builder for details that should bend with a ProductSkin.

  Call .on(skin, points) for side/u/v sampling or .fromRefs(points) for explicit surface refs, then configure width, thickness, offset, sampling, material, and color before build().
- `place(detail: Shape | ShapeGroup, ref: ProductRefInput, options?: ProductAttachOptions): Shape | ShapeGroup` — Place a shape or group on a ProductSurfaceRef.
- `landing(name: string, radius?: number, material?: ProductMaterial): Shape` — Small blended landing volume for manual structural bridges and connection proofs.

### `Carrier`

Factory for carrier surfaces — the coordinate-and-frame owners that surface members (`SurfaceBody`) live on.

A carrier owns surface-local coordinates and 3D frames; members and paths are authored in carrier coordinates, never in raw Cartesian math. Cylinder coordinates are `{ angle, z }` with `angle` in degrees — paths handle seam wrapping, so never compute positions with trig. `clearance()`/`offset()` lift geometry off the nominal surface. A ProductSkin carrier path stays on one side (`left`/`right`/`top`/`bottom`); for multi-side detail, split into one member per side and join them at the matching side-local coordinates from `sideTransition()` / `sideTransitionChain()` / `sideRoute()`.

```ts
// Bottle-cage arm: a curved band on a cylinder, authored in degrees + mm
const bottle = Carrier.cylinder('bottle').diameter(74).height(170).clearance(1.5);
const arm = bottle.path()
  .from({ angle: -145, z: 18 })
  .through({ angle: -80, z: 72 })
  .to({ angle: -34, z: 112 });
```

- `cylinder(name: string): CylinderCarrier` — Create an analytic cylinder carrier for bottles, limbs, tubes, guards, and cuffs.
- `plane(name: string): PlaneCarrier` — Create an analytic plane carrier for plates and local flat construction surfaces.
- `productSkin(skin: ProductSkin): ProductSkinCarrier` — Adapt an existing ProductSkin into the general surface-member carrier protocol.

### `SurfaceMembers`

- `Body(name: string): SurfaceBodyBuilder` — Start a surface-member body builder for straps, inlays, guards, braces, cuffs, and similar physical members that live on a carrier surface.

  ```js
  const carrier = Carrier.cylinder('guard-envelope').diameter(84).height(36).clearance(2);
  const guard = SurfaceBody('simple-guard')
    .carrier(carrier)
    .member('left-strut')
    .band()
    .path(carrier.path().from({ angle: -132, z: 6 }).to({ angle: -58, z: 18 }))
    .section({ width: 5.5, thickness: 2.8, edgeRadius: 0.6 })
    .member('right-strut')
    .mirrorOf('left-strut')
    .member('front-hoop')
    .band()
    .path(carrier.path().around({ z: 18, fromAngle: -58, toAngle: 58 }))
    .section({ width: 6.2, thickness: 3, edgeRadius: 0.7 })
    .join('left-strut', 'front-hoop').blend({ radius: 3.2 })
    .join('right-strut', 'front-hoop').blend({ radius: 3.2 })
    .build();
  ```
- `Band: typeof SurfaceBand`
- `band<C extends SurfaceCoordinate>(path: SurfacePath<C> | SurfacePathBuilder<C>, width: WidthProfile, cap?: SurfaceBandCap): SurfaceBand<C>`
- `roundedSlot(input: { length: number; width: number; }): RoundedSlotBuilder` — Create a rounded member-local slot feature for `SurfaceMemberBuilder.slot()`/`.cutout()`.

  Returns a fluent `RoundedSlotBuilder`: chain `.verticalTravel(mm)` to extend the slot for vertical bottle-drop style insertion (travel is summed into the slot length) and `.at({ along, across })` (or `{ z }`) to position it in member-local coordinates.

  ```js
  const arm = body.member('arm', armPath)
    .slot('upper-mount-slot', SurfaceMembers.roundedSlot({ length: 12, width: 5.7 }).verticalTravel(6).at({ z: 82 }));
  ```
- `counterbore(input: { diameter: number; clearanceDiameter: number; depth: number; }): CounterboreBuilder` — Create a cylindrical member-local counterbore feature for `SurfaceMemberBuilder.counterbore()`.

  `diameter` is the counterbore pocket diameter and must be larger than `clearanceDiameter`, the through-hole for the fastener shank. Chain `.at({ along, across })` (or `{ z }`) to position it in member-local coordinates.

  ```js
  const strap = body.member('strap', strapPath)
    .counterbore('head-pocket', SurfaceMembers.counterbore({ diameter: 9.8, clearanceDiameter: 5.7, depth: 3 }).at({ z: 58 }));
  ```
- `ribs(input: { count: number; height: number; }): MemberFeature` — Create a repeated-rib stiffening feature for `SurfaceMemberBuilder.features()`.

  Ribs belong to the surface member and follow its carrier-surface lowering; `count` ribs of the given `height` are distributed along the member.

  ```js
  const grip = body.member('grip', gripPath)
    .features(SurfaceMembers.ribs({ count: 18, height: 0.35 }));
  ```

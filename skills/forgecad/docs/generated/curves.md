---
skill-group: curves
skill-order: 100
---

# Curves & Surfacing

Smooth curves, lofted surfaces, swept solids, splines, and high-level product skins.

## Contents

- [Curves & Surfacing](#curves-surfacing) — `Loft.station`, `Loft.leftRail`, `Loft.rightRail`, `Loft.frontRail`, `Loft.backRail`, `Loft.centerRail`, `Loft.pathOnXz`, `Loft.pathOnYz`, `Loft.pathOnXy`, `Loft.withGuideRails`, `hermiteTransitionG2`, `nurbs3d`, `spline2d`, `spline3d`, `loft`, `loftAlongSpine`, `sweep`, `variableSweep`, `nurbsSurface`, `surfacePatch`, `transitionCurve`, `transitionSurface`, `connectEdges`
- [Surface Members](#surface-members) — `surfaceBand`, `SurfaceBody`
- [Curve3D](#curve3d)
- [NurbsCurve3D](#nurbscurve3d)
- [NurbsSurface](#nurbssurface)
- [PathBuilder](#pathbuilder) — Line Segments, Arcs, Curves, Closing & Output
- [HermiteCurve3D](#hermitecurve3d)
- [QuinticHermiteCurve3D](#quintichermitecurve3d)
- [ProductSkin](#productskin)
- [ProductSurfaceRef](#productsurfaceref)
- [ProductSurfaceBuilder](#productsurfacebuilder)
- [ProductSkinBuilder](#productskinbuilder)
- [ProductStationBuilder](#productstationbuilder)
- [ProductPanelBuilder](#productpanelbuilder)
- [ProductRibbonBuilder](#productribbonbuilder)
- [ProductSpoutBuilder](#productspoutbuilder)
- [ProductHandleBuilder](#producthandlebuilder)
- [ProductHandleFeature](#producthandlefeature)
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
- [Surface](#surface)
- [Blend](#blend)
- [Analysis](#analysis)
- [Product](#product)
- [Carrier](#carrier)
- [SurfaceMembers](#surfacemembers)
- [Slot](#slot)
- [Counterbore](#counterbore)
- [Ribs](#ribs)

## Functions

### Curves & Surfacing

#### `Loft.station()` — Create a loft station from a 2D profile and an axis position.

```ts
Loft.station(profile: Sketch, position: number): LoftStation
```

`LoftStation`: `{ profile: Sketch, position: number }`

#### `Loft.leftRail()` — Create a guide rail that constrains the section-local negative-X side.

```ts
Loft.leftRail(path: LoftGuideRailPath): LoftGuideRail
```

`LoftGuideRail`: `{ side: LoftGuideRailSide, path: LoftGuideRailPath }`

#### `Loft.rightRail()` — Create a guide rail that constrains the section-local positive-X side.

```ts
Loft.rightRail(path: LoftGuideRailPath): LoftGuideRail
```

#### `Loft.frontRail()` — Create a guide rail that constrains the section-local positive-Y side.

```ts
Loft.frontRail(path: LoftGuideRailPath): LoftGuideRail
```

#### `Loft.backRail()` — Create a guide rail that constrains the section-local negative-Y side.

```ts
Loft.backRail(path: LoftGuideRailPath): LoftGuideRail
```

#### `Loft.centerRail()` — Create a guide rail that moves section centers along the loft.

```ts
Loft.centerRail(path: LoftGuideRailPath): LoftGuideRail
```

#### `Loft.pathOnXz()` — Place a 2D guide path onto the XZ plane.

The path's first coordinate becomes X and its second coordinate becomes Z. Use this for left/right silhouette rails authored with [`path()`](/docs/sketch#path) or [`constrainedSketch()`](/docs/sketch#constrainedsketch).

```ts
Loft.pathOnXz(path: LoftPath2D, y?: number): Vec3[]
```

#### `Loft.pathOnYz()` — Place a 2D guide path onto the YZ plane.

The path's first coordinate becomes Y and its second coordinate becomes Z. Use this for front/back crown rails authored with [`path()`](/docs/sketch#path) or [`constrainedSketch()`](/docs/sketch#constrainedsketch).

```ts
Loft.pathOnYz(path: LoftPath2D, x?: number): Vec3[]
```

#### `Loft.pathOnXy()` — Place a 2D guide path onto the XY plane.

The path's first coordinate becomes X and its second coordinate becomes Y. Use this when lofting along X or Y and a rail lives in a horizontal sketch plane.

```ts
Loft.pathOnXy(path: LoftPath2D, z?: number): Vec3[]
```

#### `Loft.withGuideRails()` — Loft through profile stations while forcing generated sections to follow guide rails.

Stations define the cross-section family. Guide rails define the side or center paths the loft must pass through. With opposite side rails, the section is scaled to touch both rails. With one side rail, the section keeps its interpolated size unless a center rail is also present.

```ts
Loft.withGuideRails(stations: LoftStation[], rails: LoftGuideRail[], options?: LoftWithGuideRailsOptions): Shape
```

**`LoftOptions`**
- `edgeLength?: number` — Marching-grid edge length for level-set meshing. Smaller = finer.
- `boundsPadding?: number` — Optional extra bounds padding.

**`LoftWithGuideRailsOptions`** extends LoftOptions
- `axis?: LoftAxis` — Primary station axis. Default Z.
- `samples?: number` — Number of generated loft stations including ends. Default scales with station count.
- `railSamples?: number` — Number of points sampled from curve-backed rails before axis interpolation. Default 64.

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
| `domain?` | `SurfaceDomainOptions` | Optional rectangular parameter domain in normalized [0, 1] U/V space. |
| `trim?` | `SurfaceTrimOptions` | Optional polygonal or NURBS-curve UV trim loops. Truck and OCCT support open trimmed surfaces; Manifold supports sampled thickened trimmed solids. |
| `tessellation?` | `SurfaceTessellationOptions` | Optional Truck kernel tessellation controls for render mesh generation. |
| `approximate?` | `boolean` | Explicit opt-in for sampled approximation paths on non-exact backends. |

**`SurfaceDomainOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `uMin?` | `number` | Lower U parameter bound in normalized surface space (default 0). |
| `uMax?` | `number` | Upper U parameter bound in normalized surface space (default 1). |
| `vMin?` | `number` | Lower V parameter bound in normalized surface space (default 0). |
| `vMax?` | `number` | Upper V parameter bound in normalized surface space (default 1). |

**`SurfaceTrimOptions`**
- `outer: SurfaceTrimLoopInput` — Outer trim loop in normalized post-domain UV space.
- `holes?: SurfaceTrimLoopInput[]` — Optional hole loops in normalized post-domain UV space.

**`SurfaceTessellationOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `mode?` | `"uniform" \| "adaptive"` | `uniform` uses resolution directly; `adaptive` lets the Truck kernel refine open sheets from chord error. |
| `tolerance?` | `number` | Target chord-error tolerance in model units for adaptive Truck tessellation. |
| `minResolution?` | `number` | Minimum adaptive samples per direction. |
| `maxResolution?` | `number` | Maximum adaptive samples per direction. Defaults to `resolution` when omitted. |

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

### Surface Members

#### `surfaceBand()`

```ts
surfaceBand<C extends SurfaceCoordinate>(path: SurfacePath<C> | SurfacePathBuilder<C>, width: WidthProfile, cap?: SurfaceBandCap): SurfaceBand<C>
```

#### `SurfaceBody()` — Start a surface-member body builder for straps, inlays, guards, braces, cuffs, and similar physical members that live on a carrier surface.

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

```ts
SurfaceBody(name: string): SurfaceBodyBuilder
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
| `domain` | `SurfaceDomainCompilePlan` | — |

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

#### `toPolyline()` — Return the open path as a sampled 2D polyline.

This is for construction geometry such as guide rails, measured centerlines, and curve-driven helpers where the authored path should stay open instead of becoming a filled sketch or stroked profile.

```ts
const rail = path()
  .moveTo(24, 0)
  .bezierTo(32, 44, 28, 92, 18, 120)
  .toPolyline();
```

```ts
toPolyline(): [ number, number ][]
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

#### [`toShape()`](/docs/sdf#toshape) — Return the renderable shape generated for this product skin.

```ts
toShape(): Shape
```

#### `with()` — Create a group containing this skin plus named child details.

```ts
with(...children: GroupInput[]): ShapeGroup
```

#### `integrate()` — Boolean-union structural details into the skin body.

```ts
integrate(...details: Shape[]): Shape
```

#### `uv()` — Create a side/u/v surface-ref query on this skin.

```ts
uv(side: ProductSkinSide, u?: number, v?: number): ProductSkinRefQuery
```

**`ProductSkinSide`** — Semantic side of a ProductSkin. `back` is accepted as an alias for `rear`.

`"left" | "right" | "top" | "bottom" | "front" | "rear" | "back"`

**`ProductSkinRefQuery`**

| Option | Type | Description |
|--------|------|-------------|
| `side` | `ProductSkinSide` | Side of the product skin. `front` is the minimum axis cap, `rear`/`back` is the maximum axis cap. |
| `u?` | `number` | Across-side parameter for side refs. Defaults to 0.5. |
| `v?` | `number` | Along-axis parameter, 0 at the first cap and 1 at the rear/back cap. Defaults to 0.5. |
| `offset?` | `number` | Positive distance away from the surface along the resolved normal. |

#### `ref()` — Resolve a named ref published with Product.skin().refs(...).

```ts
ref(name: string): ProductSurfaceRef
```

#### `curveOnSurface()` — Create a sampled curve as a sequence of surface refs on this skin.

```ts
curveOnSurface(name: string, points: Array<Partial<ProductSkinRefQuery> & { side: ProductSkinSide; }>): ProductSurfaceRef[]
```

#### `surface()` — Create a fluent surface helper for refs and conformal features on one side of this skin.

Use this when several refs or ribbons share the same skin side; side-local helpers keep path points concise and make it harder to mix sides accidentally.

```ts
surface(side: ProductSkinSide): ProductSurfaceBuilder
```

#### `stationAt()` — Interpolate center, width, and depth at a normalized v or absolute axis value.

```ts
stationAt(vOrAxis: number): { ... }
```

**`ProductProfileKind`**

`"oval" | "roundedRect" | "circle" | "superEllipse" | "custom"`

#### `frame()` — Build a local surface frame from a side/u/v query.

```ts
frame(query: ProductSkinRefQuery): ProductSurfaceFrame
```

`ProductSurfaceFrame`: `{ point: Vec3, normal: Vec3, tangentU: Vec3, tangentV: Vec3, matrix: Mat4, skin: string }`

### `ProductSurfaceRef`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string | undefined` | — |

**Methods:**

#### `frame()` — Resolve this semantic surface ref into a point, normal, tangents, and placement matrix.

```ts
frame(overrides?: Partial<ProductSkinRefQuery>): ProductSurfaceFrame
```

#### `with()` — Return a copy of this ref with side/u/v/offset overrides.

```ts
with(overrides: Partial<ProductSkinRefQuery>): ProductSurfaceRef
```

#### `attach()` — Place a detail shape or group on this ref's local surface frame.

```ts
attach(detail: Shape | ShapeGroup, options?: ProductAttachOptions): Shape | ShapeGroup
```

`ProductAttachOptions`: `{ offset?: number, inset?: number }`

#### `querySpec()` — Return the serializable side/u/v query behind this ref.

```ts
querySpec(): ProductSkinRefQuery
```

### `ProductSurfaceBuilder`

Fluent helper bound to one ProductSkin side for refs and side-local conformal features.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `side` | `ProductSkinSide` | — |

**Methods:**

#### `ref()` — Create a ref on this skin side.

```ts
ref(u?: number, v?: number, offset?: number): ProductSurfaceRef
```

#### `uv()` — Create a side/u/v query on this skin side.

```ts
uv(u?: number, v?: number, offset?: number): ProductSkinRefQuery
```

#### `frame()` — Resolve a point/frame on this surface using the builder's side.

```ts
frame(query?: Partial<ProductSkinRefQuery>): ProductSurfaceFrame
```

#### `ribbon()` — Start a conformal ribbon on this skin side.

Path points use side-local `u`/`v` coordinates; this builder supplies the side. The returned ProductRibbonBuilder is already bound to the source skin and can be further configured before build(). Use `widthSamples` >= 3 when the ribbon must visibly wrap over curved product sections instead of behaving like a flat strip.

```ts
ribbon(name: string, points: ProductSurfacePathPoint[], options?: ProductRibbonBuildOptions): ProductRibbonBuilder
```

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

### `ProductSkinBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `axis()` — Choose the primary station axis for the skin loft.

```ts
axis(axis: ProductSkinAxis): this
```

**`ProductSkinAxis`** — Primary world axis used to order ProductSkin loft stations.

`"X" | "Y" | "Z"`

#### `stations()` — Set named cross-section stations for the product skin.

```ts
stations(stations: Array<ProductStationBuilder | ProductStationSpec>): this
```

`ProductStationSpec`: `{ name: string, center: Vec3, profile: ProductStationProfile, crown?: number }`

`ProductStationProfile`: `{ sketch: Sketch, width: number, depth: number, kind: ProductProfileKind, radius?: number, exponent?: number }`

#### `rails()` — Attach named guide rails for product-skin construction and downstream surface references.

```ts
rails(rails: Record<string, ProductRailSpec>): this
```

`ProductRailSpec`: `{ kind: ProductRailKind, points: Vec3[], degree?: number, name?: string }`

**`ProductRailKind`**

`"bezier" | "nurbs" | "polyline"`

#### `ref()` — Publish a named semantic surface ref on the skin.

```ts
ref(name: string, query: ProductSkinRefQuery): this
```

#### `refs()` — Publish multiple named semantic surface refs on the skin.

```ts
refs(refs: Record<string, ProductSkinRefQuery>): this
```

#### `uv()` — Create a side/u/v surface-ref query for use in refs(...) or Product.ref(...).

```ts
uv(side: ProductSkinSide, u?: number, v?: number): ProductSkinRefQuery
```

#### `material()` — Apply a product material preset to the lowered skin.

```ts
material(material: ProductMaterial): this
```

#### `color()` — Apply a simple color override to the lowered skin.

```ts
color(color: string): this
```

#### `edgeLength()` — Set the sampled loft target edge length.

```ts
edgeLength(value: number): this
```

#### `wall()` — Record intended wall thickness for product design metadata. Use explicit shelling when the model needs real inner-wall geometry.

```ts
wall(thickness: number): this
```

#### `build()` — Lower stations and refs into a ProductSkin body.

```ts
build(): ProductSkin
```

### `ProductStationBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `at()` — Position this station in world coordinates.

```ts
at(point: Vec3): this
```

#### `z()` — Convenience for traditional Z-up section stacks.

```ts
z(z: number): this
```

#### `y()` — Convenience for product bodies running front-to-back along Y.

```ts
y(y: number): this
```

#### `x()` — Convenience for product bodies running left-to-right along X.

```ts
x(x: number): this
```

#### `oval()` — Use an oval cross-section with full width and depth dimensions.

```ts
oval(width: number, depth: number, options?: { segments?: number; }): this
```

#### `superEllipse()` — Use a superellipse cross-section for soft-square product surfaces.

```ts
superEllipse(width: number, depth: number, options?: ProductStationSuperEllipseOptions): this
```

`ProductStationSuperEllipseOptions`: `{ segments?: number, exponent?: number }`

#### [`roundedRect()`](/docs/sketch#roundedrect) — Use a rounded-rectangle cross-section with the given corner radius.

```ts
roundedRect(width: number, depth: number, radius: number): this
```

#### [`circle()`](/docs/sketch#circle) — Use a circular cross-section from a full diameter.

```ts
circle(diameter: number, options?: { segments?: number; }): this
```

#### `custom()` — Use a custom 2D sketch as the station cross-section.

```ts
custom(sketch: Sketch, width: number, depth: number): this
```

#### `crown()` — Set the station crown amount for soft product-section intent.

```ts
crown(amount: number): this
```

#### `toSpec()` — Return the immutable station spec consumed by Product.skin().

```ts
toSpec(): ProductStationSpec
```

### `ProductPanelBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `rounded()` — Use a rounded rectangle panel profile.

```ts
rounded(width: number, height: number, radius?: number): this
```

#### `oval()` — Use an oval panel profile.

```ts
oval(width: number, height: number): this
```

#### `profile()` — Use a custom 2D panel profile.

```ts
profile(profile: Sketch): this
```

#### `thickness()` — Set panel extrusion thickness.

```ts
thickness(thickness: number): this
```

#### `material()` — Apply a product material preset to the panel.

```ts
material(material: ProductMaterial): this
```

#### `color()` — Apply a simple color override to the panel.

```ts
color(color: string): this
```

#### `build()` — Build the panel in local coordinates.

```ts
build(): Shape
```

#### `attachTo()` — Build and attach this panel to a ProductSurfaceRef.

```ts
attachTo(ref: ProductRefInput, options?: ProductPanelAttachOptions): Shape
```

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

#### `on()` — Follow a ProductSkin with side/u/v path queries or refs.

This is the highest-fidelity mode because every interpolated sample is resolved through ProductSkin.frame(), so the ribbon bends along the selected side as station width/depth changes. All query path points must stay on one side; split side transitions into separate ribbons.

```ts
on(skin: ProductSkin, points: ProductRibbonPathPoint[], options?: ProductRibbonBuildOptions): this
```

**`ProductRibbonPathPoint`** — Path point for Product.ribbon().on(...): either a side/u/v query or a resolved surface ref.

`ProductSkinRefQuery | ProductSurfaceRef`

#### `fromRefs()` — Follow explicit surface refs.

Useful for named refs or paths assembled elsewhere. The builder resolves each ref frame and interpolates between those frames; use on(skin, points) when you need full skin-side sampling between sparse control points.

```ts
fromRefs(points: ProductSurfaceRef[], options?: ProductRibbonBuildOptions): this
```

#### `width()` — Set ribbon width in millimeters.

```ts
width(width: number): this
```

#### `thickness()` — Set solid thickness outward from the source surface in millimeters.

```ts
thickness(thickness: number): this
```

#### `offset()` — Set positive clearance between the source surface and the ribbon's inner face.

```ts
offset(offset: number): this
```

#### `samples()` — Set samples along the path.

```ts
samples(samples: number): this
```

#### `widthSamples()` — Set samples across the width. Use 3+ to bend over curved cross-sections.

```ts
widthSamples(samples: number): this
```

#### `resolution()` — Set NURBS tessellation resolution.

```ts
resolution(resolution: number): this
```

#### `material()` — Apply a product material preset.

```ts
material(material: ProductMaterial): this
```

#### `color()` — Apply a simple color override.

```ts
color(color: string): this
```

#### `build()` — Build a conformal ribbon as a thin NURBS surface solid.

```ts
build(options?: ProductRibbonBuildOptions): Shape
```

### `ProductSpoutBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `from()` — Set the skin ref this spout projects from.

```ts
from(ref: ProductSurfaceRef): this
```

#### `sections()` — Set local spout section profiles from root to mouth.

```ts
sections(sections: Array<Sketch | ProductStationBuilder | ProductStationSpec>): this
```

#### `projection()` — Set the projection length along the source ref normal.

```ts
projection(length: number): this
```

#### `edgeLength()` — Set the sampled loft target edge length for the spout.

```ts
edgeLength(value: number): this
```

#### `material()` — Apply a product material preset to the spout.

```ts
material(material: ProductMaterial): this
```

#### `color()` — Apply a simple color override to the spout.

```ts
color(color: string): this
```

#### `build()` — Build the spout in local coordinates.

```ts
build(): Shape
```

#### `attach()` — Build and place the spout on its source ref.

```ts
attach(options?: ProductAttachOptions): Shape
```

### `ProductHandleBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `between()` — Set the upper body ref and lower world anchor for the handle.

```ts
between(upper: ProductSurfaceRef, lower: Vec3): this
```

#### `spine()` — Set an explicit handle centerline from points or a rail spec.

```ts
spine(points: Vec3[] | ProductRailSpec): this
```

#### `grip()` — Set the grip cross-section profile.

```ts
grip(profile: Sketch): this
```

#### `material()` — Apply a product material preset to the grip.

```ts
material(material: ProductMaterial): this
```

#### `padMaterial()` — Apply a product material preset to handle landing pads.

```ts
padMaterial(material: ProductMaterial): this
```

#### `edgeLength()` — Set the sampled loft target edge length for the grip.

```ts
edgeLength(value: number): this
```

#### `build()` — Build the handle grip and landing pads.

```ts
build(): ProductHandleFeature
```

### `ProductHandleFeature`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `grip` | `Shape` | — |
| `upperPad` | `Shape` | — |
| `lowerPad` | `Shape` | — |

**Methods:**

#### `structural()` — Return the physical shapes that make up this handle feature.

```ts
structural(): Shape[]
```

#### [`toShape()`](/docs/sdf#toshape) — Boolean-union the handle feature into a single shape.

```ts
toShape(): Shape
```

#### `toGroup()` — Return the handle as a named ShapeGroup preserving child colors.

```ts
toGroup(): ShapeGroup
```

### `CylinderCarrier`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `kind` | `"cylinder"` | — |

**Methods:**

#### `diameter()`

```ts
diameter(value: number): this
```

#### `radius()`

```ts
radius(value: number): this
```

#### `height()`

```ts
height(value: number): this
```

#### `clearance()`

```ts
clearance(value: number): this
```

#### `center()`

```ts
center(point: Vec3): this
```

#### [`path()`](/docs/sketch#path)

```ts
path(): SurfacePathBuilder<CylinderSurfaceCoordinate>
```

#### `anchor()`

```ts
anchor(angle: number, z?: number, options?: { offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `front()`

```ts
front(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `back()`

```ts
back(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `left()`

```ts
left(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `right()`

```ts
right(options?: { z?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `top()`

```ts
top(options?: { angle?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `bottom()`

```ts
bottom(options?: { angle?: number; offset?: number; }): SurfaceAnchor<CylinderSurfaceCoordinate>
```

#### `pointAt()`

```ts
pointAt(coordinate: CylinderSurfaceCoordinate): Vec3
```

#### `mirrorPoint()`

```ts
mirrorPoint(point: Vec3): Vec3
```

#### `normalAt()`

```ts
normalAt(coordinate: CylinderSurfaceCoordinate): Vec3
```

#### `tangentAt()`

```ts
tangentAt(coordinate: CylinderSurfaceCoordinate, tangentHint?: Vec3): Vec3
```

#### `frameAt()`

```ts
frameAt(coordinate: CylinderSurfaceCoordinate, tangentHint?: Vec3): SurfaceFrame
```

#### `bounds()`

```ts
bounds(): SurfaceBounds
```

#### `offset()`

```ts
offset(distance: number): CylinderCarrier
```

#### `mirrorCoordinate()`

```ts
mirrorCoordinate(coordinate: CylinderSurfaceCoordinate): CylinderSurfaceCoordinate
```

#### `radiusValueWithClearance()`

```ts
radiusValueWithClearance(): number
```

### `PlaneCarrier`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `kind` | `"plane"` | — |

**Methods:**

#### `size()`

```ts
size(width: number, height: number): this
```

#### `origin()`

```ts
origin(point: Vec3): this
```

#### `normal()`

```ts
normal(normal: Vec3): this
```

#### [`path()`](/docs/sketch#path)

```ts
path(): SurfacePathBuilder<PlaneSurfaceCoordinate>
```

#### `anchor()`

```ts
anchor(x?: number, y?: number, options?: { offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>
```

#### `left()`

```ts
left(options?: { y?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>
```

#### `right()`

```ts
right(options?: { y?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>
```

#### `top()`

```ts
top(options?: { x?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>
```

#### `bottom()`

```ts
bottom(options?: { x?: number; offset?: number; }): SurfaceAnchor<PlaneSurfaceCoordinate>
```

#### `pointAt()`

```ts
pointAt(coordinate: PlaneSurfaceCoordinate): Vec3
```

#### `mirrorPoint()`

```ts
mirrorPoint(point: Vec3): Vec3
```

#### `normalAt()`

```ts
normalAt(): Vec3
```

#### `tangentAt()`

```ts
tangentAt(coordinate: PlaneSurfaceCoordinate, tangentHint?: Vec3): Vec3
```

#### `frameAt()`

```ts
frameAt(coordinate: PlaneSurfaceCoordinate, tangentHint?: Vec3): SurfaceFrame
```

#### `bounds()`

```ts
bounds(): SurfaceBounds
```

#### `offset()`

```ts
offset(distance: number): PlaneCarrier
```

#### `mirrorCoordinate()`

```ts
mirrorCoordinate(coordinate: PlaneSurfaceCoordinate): PlaneSurfaceCoordinate
```

### `ProductSkinCarrier`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `skin` | `ProductSkin` | — |
| `name` | `string` | — |
| `kind` | `"productSkin"` | — |

**Methods:**

#### `surface()`

```ts
surface(side: ProductSkinSide): ProductSkinCarrier
```

#### [`path()`](/docs/sketch#path)

```ts
path(): SurfacePathBuilder<ProductSkinSurfaceCoordinate>
```

`ProductSkinSurfaceCoordinate`: `{ kind?: "productSkin", side?: ProductSkinSide, u?: number, v?: number, offset?: number }`

#### `sideTransition()` — Return matching side-local coordinates for an explicit split-member transition.

Each SurfacePath still stays on one ProductSkin side. Use this helper to create one member ending on `from`, another starting on `to`, then join named anchors. The helper validates normalized `v`, non-empty names, adjacency, and physical coincidence before returning anchors.

```ts
sideTransition(fromSide: ProductSkinSide, toSide: ProductSkinSide, input?: ProductSkinSideTransitionInput): ProductSkinSideTransition
```

`ProductSkinSideTransitionInput`: `{ name?: string, v?: number, offset?: number }`

`ProductSkinSideTransition`: `{ name?: string, from: ProductSkinSurfaceCoordinate, to: ProductSkinSurfaceCoordinate }`

#### `sideTransitionChain()` — Return a sequence of matching side-local coordinates for an explicit multi-side split-member route.

Each adjacent side pair becomes one named transition. Build one member per side segment, add transition anchors at each returned pair, then join the anchors. The same validation as `sideTransition()` applies to every adjacent pair.

```ts
sideTransitionChain(sides: ProductSkinSide[], input?: ProductSkinSideTransitionInput): ProductSkinSideTransition[]
```

#### `sideRoute()` — Return side-local member segments for a generated multi-side split-member route.

The route still compiles as explicit members plus named-anchor joins. This helper only generates the per-side segment endpoints and transition names.

```ts
sideRoute(input: ProductSkinSideRouteInput): ProductSkinSideRoute
```

**`ProductSkinSideRouteInput`**: `name?: string`, `sides: ProductSkinSide[]`, `from: ProductSkinSurfaceCoordinate`, `to: ProductSkinSurfaceCoordinate`, `v?: number`, `offset?: number`

`ProductSkinSideRoute`: `{ name?: string, transitions: ProductSkinSideTransition[], segments: ProductSkinSideRouteSegment[] }`

**`ProductSkinSideRouteSegment`**: `name: string`, `side: ProductSkinSide`, `from: ProductSkinSurfaceCoordinate`, `to: ProductSkinSurfaceCoordinate`, `startAnchorName?: string`, `endAnchorName?: string`

#### `pointAt()`

```ts
pointAt(coordinate: ProductSkinSurfaceCoordinate): Vec3
```

#### `mirrorPoint()`

```ts
mirrorPoint(point: Vec3): Vec3
```

#### `normalAt()`

```ts
normalAt(coordinate: ProductSkinSurfaceCoordinate): Vec3
```

#### `tangentAt()`

```ts
tangentAt(coordinate: ProductSkinSurfaceCoordinate, tangentHint?: Vec3): Vec3
```

#### `frameAt()`

```ts
frameAt(coordinate: ProductSkinSurfaceCoordinate, tangentHint?: Vec3): SurfaceFrame
```

**`SurfaceFrame`**: `point: Vec3`, `normal: Vec3`, `tangentAlong: Vec3`, `tangentAcross: Vec3`, `matrix: Mat4`, `carrier: string`, `representation: SurfaceCarrierKind | string`, `coordinate: SurfaceCoordinate`

#### `bounds()`

```ts
bounds(): SurfaceBounds
```

**`SurfaceBounds`**: `u?: [ number, number ]`, `v?: [ number, number ]`, `angle?: [ number, number ]`, `z?: [ number, number ]`, `x?: [ number, number ]`, `y?: [ number, number ]`

#### `offset()`

```ts
offset(distance: number): ProductSkinCarrier
```

#### `mirrorCoordinate()`

```ts
mirrorCoordinate(coordinate: ProductSkinSurfaceCoordinate): ProductSkinSurfaceCoordinate
```

### `SurfacePath`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `carrier` | `CarrierSurface<C>` | — |
| `points` | `C[]` | — |
| `closedValue` | `boolean` | — |

**Methods:**

#### `closed()`

```ts
closed(): SurfacePath<C>
```

#### `mirror()`

```ts
mirror(): SurfacePath<C>
```

#### `coordinateAt()`

```ts
coordinateAt(t: number): C
```

#### `sample()`

```ts
sample(count?: number): SurfacePathSample<C>[]
```

#### `length()`

```ts
length(samples?: number): number
```

### `SurfacePathBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `carrier` | `CarrierSurface<C>` | — |

**Methods:**

#### `from()`

```ts
from(coordinate: C): this
```

#### `through()`

```ts
through(coordinate: C): this
```

#### `to()`

```ts
to(coordinate: C): this
```

#### `around()`

```ts
around(input: { z: number; fromAngle: number; toAngle: number; offset?: number; }): this
```

#### `closed()`

```ts
closed(): this
```

#### `mirror()`

```ts
mirror(): SurfacePath<C>
```

#### `build()`

```ts
build(): SurfacePath<C>
```

#### `sample()`

```ts
sample(count?: number): SurfacePathSample<C>[]
```

### `SurfaceBand`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `centerPath` | `SurfacePath<C>` | — |
| `widthProfile` | `WidthProfile` | — |
| `capStyle` | `SurfaceBandCap` | — |

**Methods:**

#### `widthAt()`

```ts
widthAt(t: number): number
```

#### `boundaries()`

```ts
boundaries(samples?: number): SurfaceBandBoundarySample[]
```

#### `withHole()` — Return a new band with a named member-local rounded-slot hole region recorded as inspectable intent.

```ts
withHole(name: string, input: SurfaceBandHoleInput): SurfaceBand<C>
```

#### `holes()` — Resolve recorded hole regions into member-local across/along loops.

```ts
holes(): SurfaceBandHoleRegion[]
```

### `SurfaceBodyBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `carrier()`

```ts
carrier(carrier: CarrierSurface): this
```

#### `member()`

```ts
member(name: string): SurfaceMemberBuilder
```

#### `join()`

```ts
join(from: string, to: string | string[]): SurfaceJoinBuilder
```

#### `autoJoinAtSharedAnchors()`

```ts
autoJoinAtSharedAnchors(): this
```

#### `build()`

```ts
build(): Shape | ShapeGroup
```

### `SurfaceMemberBuilder`

#### `plate()`

```ts
plate(): this
```

#### `band()`

```ts
band(): this
```

#### `at()`

```ts
at(anchor: SurfaceAnchor<C>): this
```

#### `size()`

```ts
size(width: number, height: number): this
```

#### [`path()`](/docs/sketch#path)

```ts
path(path: SurfacePath<C> | SurfacePathBuilder<C>): this
```

#### `section()`

```ts
section(section: MemberSectionInput): this
```

#### `cap()`

```ts
cap(style: SurfaceBandCap): this
```

#### [`slot()`](/docs/sketch#slot)

```ts
slot(name: string, feature: MemberFeature | RoundedSlotBuilder): this
```

#### `cutout()`

```ts
cutout(name: string, feature: MemberFeature | RoundedSlotBuilder): this
```

#### `counterbore()`

```ts
counterbore(name: string, feature: MemberFeature | CounterboreBuilder): this
```

#### `anchorAt()` — Add a named anchor at a carrier surface coordinate for explicit member joins.

```ts
anchorAt(name: string, coordinate: C | SurfaceAnchor<C>): this
```

#### `features()`

```ts
features(features: MemberFeature | MemberFeature[]): this
```

#### `profile()`

```ts
profile(name: string, options?: { depth?: number; height?: number; }): this
```

#### `mirrorOf()`

```ts
mirrorOf(memberName: string): SurfaceBodyBuilder
```

#### `member()`

```ts
member(name: string): SurfaceMemberBuilder
```

#### `join()`

```ts
join(from: string, to: string | string[]): SurfaceJoinBuilder
```

#### `autoJoinAtSharedAnchors()`

```ts
autoJoinAtSharedAnchors(): SurfaceBodyBuilder
```

#### `build()`

```ts
build(): Shape | ShapeGroup
```

### `SurfaceJoinBuilder`

#### `betweenAnchors()` — Select named anchors on the source and target members before lowering this join.

```ts
betweenAnchors(fromAnchor: string, toAnchor: string): this
```

#### `blend()`

```ts
blend(input?: { radius?: number; style?: string; priority?: number; continuity?: string; }): SurfaceBodyBuilder
```

### `CounterboreBuilder`

#### `at()`

```ts
at(input: { along?: number; across?: number; z?: number; }): this
```

#### `named()`

```ts
named(name: string): MemberFeature
```

#### `toFeature()`

```ts
toFeature(name?: string): MemberFeature
```

### `RoundedSlotBuilder`

#### `verticalTravel()`

```ts
verticalTravel(value: number): this
```

#### `at()`

```ts
at(input: { along?: number; across?: number; z?: number; }): this
```

#### `named()`

```ts
named(name: string): MemberFeature
```

#### `toFeature()`

```ts
toFeature(name?: string): MemberFeature
```

---

## Constants

### `Surface`

- `Plane(options: SurfacePlaneOptions): Shape` — Create a finite analytic plane sheet that can be trimmed, sewn, thickened, or used as a low-level face.
- `Cylinder(options: SurfaceCylinderOptions): Shape` — Create a finite analytic cylindrical sheet, optionally bounded by start/end angles.
- `Cone(options: SurfaceConeOptions): Shape` — Create a finite analytic conical or frustum sheet, optionally bounded by start/end angles.
- `Sphere(options: SurfaceSphereOptions): Shape` — Create a finite analytic spherical sheet bounded by longitude and latitude ranges.
- `Torus(options: SurfaceTorusOptions): Shape` — Create a finite analytic torus sheet bounded by major and tube angle ranges.
- `Nurbs(controlGrid: Vec3[][], options?: NurbsSurfaceOptions): Shape`
- `Ruled(curveA: ExactCurveInput, curveB: ExactCurveInput, options?: SurfaceCommonOptions): Shape`
- `Patch(curves: { bottom: ExactCurveInput; top: ExactCurveInput; left: ExactCurveInput; right: ExactCurveInput; }, options?: SurfacePatchOptions): Shape`
- `Boundary(input: SurfaceBoundaryInput): Shape`
- `Fill(input: SurfaceFillInput): Shape`
- `Sew(shapes: Shape[], options?: { tolerance?: number; }): Shape`
- `Solid(input: Shape | Shape[], options?: SurfaceSolidOptions): Shape` — Sew surface faces or consume an existing sewn shell and make a solid B-rep.
- `Extend(shape: Shape, options: SurfaceExtendOptions): Shape`
- `Trim(shape: Shape, tool: Shape | SurfacePlaneOp): Shape`
- `Split(shape: Shape, tool: Shape | SurfacePlaneOp): [ Shape, Shape ]`
- `Match(shape: Shape, options: { edge: "u0" | "u1" | "v0" | "v1"; target: EdgeRef; continuity?: SurfaceContinuity; }): Shape`
- `MatchEdge(shape: Shape, options: { edge: "u0" | "u1" | "v0" | "v1"; target: EdgeRef; continuity?: SurfaceContinuity; }): Shape`

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
- `rail: { bezier(points: Vec3[], options?: { name?: string; }): ProductRailSpec; nurbs(points: Vec3[], options?: { degree?: number; name?: string; }): ProductRailSpec; polyline(points: Vec3[], options?: { name?: string; }): ProductRailSpec; }` — Namespaced rail builders for product skin guide rails and handle spines.
- `profiles: { ... }` — Namespaced product profile helpers for stations, panels, trims, and openings.
- `materials: { ... }` — Namespaced product material presets for molded plastic, rubber, metal, and transparent parts.
- `applyMaterial(shape: Shape, preset: ProductMaterial | undefined): Shape` — Apply a product material preset to a Shape.
- `scenePreset(name: ProductScenePreset): void` — Apply an opinionated scene preset for product review renders.
- `ovalProfile(width: number, depth: number, options?: ProductProfileOptions): Sketch` — Create a centered oval profile from full width/depth dimensions.
- `roundedRectProfile(width: number, depth: number, radius: number): Sketch` — Create a centered rounded-rectangle profile.
- `circleProfile(diameter: number, options?: ProductProfileOptions): Sketch` — Create a centered circular profile from full diameter.
- `superEllipseProfile(width: number, depth: number, options?: ProductSuperEllipseOptions): Sketch` — Create a centered superellipse profile for soft-square product sections.
- `profileSize(sketch: Sketch): { width: number; depth: number; }` — Measure the width and depth of a 2D profile sketch.
- `describeProfile(sketch: Sketch, kind?: ProductProfileKind, radius?: number): ProductProfileDescriptor` — Describe a custom sketch as a product profile.
- `scaleProfileTo(sketch: Sketch, width: number, depth: number): Sketch` — Scale an existing profile sketch to a target width/depth.
- `ref(skin: ProductSkin, query: ProductSkinRefQuery): ProductSurfaceRef` — Create an ad-hoc ProductSurfaceRef from a skin and side/u/v query.
- `surface(skin: ProductSkin, side: ProductSkinSide): ProductSurfaceBuilder` — Create a fluent surface helper for refs and conformal features on one side of a skin. Equivalent to skin.surface(side), useful when writing in Product.* namespace style.
- `panel(name: string): ProductPanelBuilder` — Start a panel feature builder.
- `ribbon(name: string): ProductRibbonBuilder` — Start a conformal ribbon/trim builder for details that should bend with a ProductSkin. Call .on(skin, points) for side/u/v sampling or .fromRefs(points) for explicit surface refs, then configure width, thickness, offset, sampling, material, and color before build().
- `spout(name: string): ProductSpoutBuilder` — Start a spout/nozzle feature builder.
- `handle(name: string): ProductHandleBuilder` — Start a handle feature builder.
- `place(detail: Shape | ShapeGroup, ref: ProductRefInput, options?: ProductAttachOptions): Shape | ShapeGroup` — Place a shape or group on a ProductSurfaceRef.
- `landing(name: string, radius?: number, material?: ProductMaterial): Shape` — Small blended landing volume for manual structural bridges and connection proofs.

### `Carrier`

- `cylinder(name: string): CylinderCarrier` — Create an analytic cylinder carrier for bottles, limbs, tubes, guards, and cuffs.
- `plane(name: string): PlaneCarrier` — Create an analytic plane carrier for plates and local flat construction surfaces.
- `productSkin(skin: ProductSkin): ProductSkinCarrier` — Adapt an existing ProductSkin into the general surface-member carrier protocol.

### `SurfaceMembers`

- `Body(name: string): SurfaceBodyBuilder` — Start a surface-member body builder for straps, inlays, guards, braces, cuffs, and similar physical members that live on a carrier surface.
- `Band: typeof SurfaceBand`
- `band<C extends SurfaceCoordinate>(path: SurfacePath<C> | SurfacePathBuilder<C>, width: WidthProfile, cap?: SurfaceBandCap): SurfaceBand<C>`

### `Slot`

- `rounded(input: { length: number; width: number; }): RoundedSlotBuilder` — Create a rounded member-local slot feature.

### `Counterbore`

- `cylindrical(input: { diameter: number; clearanceDiameter: number; depth: number; }): CounterboreBuilder` — Create a cylindrical member-local counterbore feature.

### `Ribs`

- `repeated(input: { count: number; height: number; }): MemberFeature` — Create repeated ribs that belong to a surface member before lowering.

# Curves & Surfacing

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Smooth curves, lofted surfaces, swept solids, and splines.

## Functions

### Curves & Surfacing

Create smooth curves, lofted surfaces, and swept solids.

#### `spline2d()`

```ts
spline2d(points: Vec2[], options?: Spline2DOptions): Sketch
```

Build a smooth Catmull-Rom spline sketch from 2D control points. A closed spline (default) returns a filled profile. An open spline requires a strokeWidth option to produce a solid sketch. Use tension (0..1, default 0.5) to control curve tightness.

#### `spline3d()`

```ts
spline3d(points: Vec3$2[], options?: Spline3DOptions): Curve3D
```

Create a reusable 3D spline curve object (Catmull-Rom). The returned Curve3D provides sample(), pointAt(t), tangentAt(t), and length() for downstream use in sweep() or manual path operations.

#### `loft()`

```ts
loft(profiles: Sketch[], heights: number[], options?: LoftOptions): Shape
```

Loft between multiple sketches along Z stations. Profiles can differ in topology and vertex count: interpolation is done on signed-distance fields and meshed with level-set extraction. Heights must be strictly increasing. Compatible loft stacks can export through the OCCT exact route. Performance note: loft is significantly heavier than primitive/extrude/revolve. If the part is axis-symmetric (bottles, vases, knobs), prefer revolve().

#### `sweep()`

```ts
sweep(profile: Sketch, path: Curve3D | Vec3$2[], options?: SweepOptions): Shape
```

Sweep a 2D profile along a 3D path to create a solid. Path can be a Curve3D from spline3d() or an array of [x,y,z] points (polyline). The profile is interpreted in the local frame normal plane. Compatible sweeps can export through the OCCT exact route using the canonical path representation. Performance note: sweep uses level-set meshing internally. Prefer direct primitives/extrude/revolve when they can express the same shape.

---

## Classes

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

### `HermiteCurve3D`

A cubic Hermite curve in 3D space. Interpolates between two endpoints matching position and tangent (G1 continuity). Weight parameters control tangent magnitude, affecting the "reach" of the curve along each edge's direction before turning.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `p0` | `Vec3$3` | Start position |
| `p1` | `Vec3$3` | End position |
| `t0` | `Vec3$3` | Scaled tangent at start (direction * weight * chordLength) |
| `t1` | `Vec3$3` | Scaled tangent at end (direction * weight * chordLength) |
| `chordLength` | `number` | Chord length (straight-line distance between endpoints) |

**Methods:**

- `pointAt()` — Evaluate position at parameter t ∈ [0, 1]
- `tangentAt()` — Evaluate tangent (first derivative) at parameter t ∈ [0, 1]
- `curvatureAt()` — Evaluate curvature vector (second derivative) at parameter t ∈ [0, 1]
- `sample()` — Sample the curve as a polyline of evenly-spaced parameter values.
- `length()` — Approximate arc length by sampling.
- `sampleAdaptive()` — Sample with adaptive density — more points where curvature is higher. Returns at least `minCount` points, up to `maxCount`.
- `toPolyline()` — Convert to a format compatible with sweep() path input.

### `QuinticHermiteCurve3D`

A quintic Hermite curve in 3D space. Interpolates between two endpoints matching position, tangent, and second derivative (G2 / curvature continuity). Uses degree-5 Hermite basis functions. Weight parameters scale tangent magnitudes relative to chord length. Curvature vectors are scaled by weight² * chordLength² for consistent behavior.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `p0` | `Vec3$3` | Start position |
| `p1` | `Vec3$3` | End position |
| `t0` | `Vec3$3` | Scaled tangent at start (direction * weight * chordLength) |
| `t1` | `Vec3$3` | Scaled tangent at end (direction * weight * chordLength) |
| `c0` | `Vec3$3` | Scaled second derivative at start (curvature * weight² * chordLength²) |
| `c1` | `Vec3$3` | Scaled second derivative at end (curvature * weight² * chordLength²) |
| `chordLength` | `number` | Chord length (straight-line distance between endpoints) |

**Methods:**

- `pointAt()` — Evaluate position at parameter t ∈ [0, 1]
- `tangentAt()` — Evaluate tangent (first derivative, normalized) at parameter t ∈ [0, 1]
- `curvatureAt()` — Evaluate curvature vector (second derivative) at parameter t ∈ [0, 1]
- `sample()` — Sample the curve as a polyline of evenly-spaced parameter values.
- `length()` — Approximate arc length by sampling.
- `sampleAdaptive()` — Sample with adaptive density — more points where curvature is higher. Returns at least `minCount` points, up to `maxCount`.
- `toPolyline()` — Convert to a format compatible with sweep() path input.

### `PathBuilder`

**Methods:**

- `moveTo()` — moveTo(x: number, y: number): this
- `lineTo()` — lineTo(x: number, y: number): this
- `lineH()` — lineH(dx: number): this
- `lineV()` — lineV(dy: number): this
- `lineAngled()` — lineAngled(length: number, degrees: number): this
- `close()` — close(): Sketch
- `stroke()` — stroke(width: number, join?: "Round" | "Square"): Sketch

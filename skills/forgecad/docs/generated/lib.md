---
skill-group: toolbox
skill-order: 100
---

# Part Library

Pre-built fasteners, gears, pipes, structural profiles, and utility shapes. Access via `lib.*`.

## Contents

- [TangentLoop2D](#tangentloop2d)
- [DriveWheelBuilder](#drivewheelbuilder)
- [lib](#lib)

---

## Classes

### `TangentLoop2D`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `circles` | `TangentCircle2D[]` | — |
| `mode` | `BeltMode` | — |
| `segments` | `BeltPathSegment[]` | — |
| `straightSpans` | `BeltLineSpan[]` | — |
| `wraps` | `BeltWrapArc[]` | — |
| `wrapByPulley` | `Record<string, BeltWrapArc>` | — |
| `length` | `number` | — |

**Methods:**

#### `toSketch(width?: number): Sketch` — Convert the loop centerline into a thin visual sketch.

#### `toProfile(): Sketch` — Convert the loop into a filled profile using the pitch path itself as the boundary.

#### `offsetBand(thickness: number): Sketch` — Build a belt band sketch by offsetting the route to inner and outer pulley radii.

### `DriveWheelBuilder`

#### `addSpurTeethBetween(options: DriveWheelSpurTeethRegionOptions): this` — Add an involute spur-tooth window on part of the pitch circle.

`DriveWheelSpurTeethRegionOptions`: `{ name?: string, teethOnFullCircle: number, toothCount: number, firstTooth?: number, faceWidth?: number }`

#### `addSolidArcBetween(options: DriveWheelSolidArcRegionOptions): this` — Add a constant-radius solid arc region such as a dwell, stop, or pusher.

**`DriveWheelSolidArcRegionOptions`**: `name?: string`, `fromAngleDeg: number`, `toAngleDeg: number`, `innerRadius?: number`, `outerRadius: number`, `faceWidth?: number`, `segments?: number`

#### `addShapeRegion(name: string, shape: Shape, options?: DriveWheelShapeRegionOptions): this` — Add a fully custom region shape while preserving region metadata.

`DriveWheelShapeRegionOptions`: `{ fromAngleDeg?: number, toAngleDeg?: number, innerRadius?: number, outerRadius?: number }`

#### `build(): Shape` — Build the final wheel shape with a bore connector and region metadata.

---

## Constants

### `lib`

Pre-built parametric parts available in user scripts as `lib.*`.

Every key in this object becomes a method or namespace on the `lib` object exposed to `.forge.js` scripts — see the member list below for the catalog. Sizes outside the supported ranges throw at runtime with a descriptive error.

- `fastenerHole(opts: FastenerHoleOptions): Shape` — ISO metric fastener hole cutter with optional counterbore or countersink.

  Returns a cutter shape (subtract from a solid to produce the hole). Sizes outside M2–M10 will throw.

  ```ts
  const plate = box(60, 40, 8)
    .subtract(lib.fastenerHole({ size: 'M5', fit: 'normal', depth: 8 })
      .translate(15, 10, 4));
  ```
- `tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape` — Rectangular hollow tube (thin-wall box section).

  Both the outer and inner boxes are centered on the XY plane with their base at Z=0.
- `pipe(height: number, outerRadius: number, wall: number, segments?: number): Shape` — Hollow cylindrical pipe.

  Centered on the XY plane, extending upward along +Z from z=0 to z=height. For complex routed pipe geometry, see `lib.pipeRoute`.
- `explode<T extends ExplodeItem[] | ShapeGroup>(items: T, options?: ExplodeOptions): T` — Apply deterministic exploded-view offsets to an assembly tree.

  Traverses arrays, nested `{ name, group: [...] }` structures, and [`ShapeGroup`](/docs/core#shapegroup) outputs, translating each node while preserving names, colors, and nesting; returns the same structure type as the input. `radial` mode is branch-aware and parent-relative — nested assemblies peel apart level by level. Named items accept an inline `explode: { stage?, direction?, axisLock? }` override. Bakes the offset into geometry (e.g. driven by a `param()` slider); for a viewport-only slider use [`explodeView()`](/docs/viewport#explodeview) instead.

  ```js
  const explodeAmt = param('Explode', 0, { min: 0, max: 40, unit: 'mm' });

  return lib.explode(assembly, {
    amount: explodeAmt,
    stages: [0.4, 0.8],
    mode: 'radial',
    byName: { Shaft: { direction: [1, 0, 0], stage: 1.4 } },
  });
  ```
- `bracket(width: number, height: number, depth: number, thick: number, holeDia?: number): Shape` — L-shaped mounting bracket with optional through-holes.

  Produces a right-angle bracket: a horizontal base plate and a vertical wall. Both legs share `width`. Optional holes are drilled through the base (along Z) and the wall (along Y).
- `holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape` — Rectangular grid of cylindrical hole cutters.

  Returns the union of `rows × cols` cylinders laid out on a regular grid. Subtract from a solid to produce the full pattern.

  ```ts
  const pattern = lib.holePattern(3, 4, 20, 20, 4, 10);
  const panel = box(80, 70, 10).subtract(pattern.translate(-30, -20, 0));
  ```
- `thread(diameter: number, pitch: number, length: number, options?: { depth?: number; segments?: number; }): Shape` — External helical thread — clean mesh, no SDF grid artifacts.

  Builds a cross-section with a single trapezoidal tooth from the root radius out to the crest radius, then twist-extrudes it so the tooth traces a helix. Manifold's extrude+twist produces structured quad-based geometry that follows the thread profile cleanly.

  Returns a threaded cylinder along +Z from z=0 to z=length.
- `bolt(diameter: number, length: number, options?: { ... }): Shape` — ISO-style hex bolt with real helical threads.

  The hex head sits from z=0 up to z=headHeight. The shaft extends downward along −Z by `length` mm. An unthreaded shank section is included when `threadLength < length`.

  Default proportions follow ISO 4762 loosely: pitch ≈ 0.15×diameter, head height ≈ 0.65×diameter, across-flats ≈ 1.6×diameter.

  For standard M-size bolts pre-configured for a complete joint, use `fastenerSet` instead.
- `nut(diameter: number, options?: { ... }): Shape` — ISO-style hex nut with a clearance bore.

  Constructed from the intersection of three rotated slabs with a cylindrical bore subtracted. The nut is centered at the origin, height along Z (−height/2 to +height/2).

  Default proportions follow ISO 4032 loosely: height ≈ 0.8×diameter, across-flats ≈ 1.6×diameter. The bore is a clearance bore — `diameter` + 0.2 mm by default, override with `boreDiameter` for exact bore control — not modelled with helical threads, for rendering efficiency.

  For standard M-size nuts pre-configured for a complete joint, use `fastenerSet` instead.
- `washer(size: MetricSize, options?: { standard?: WasherStandard; segments?: number; }): Shape` — ISO metric flat washer (DIN 125-A).

  Returns a flat ring centered at the origin, thickness along Z. Dimensions are taken from `WASHER_TABLE`. Sizes outside M2–M10 will throw.
- `fastenerSet(size: MetricSize, boltLength: number, options?: FastenerSetOptions): FastenerSetResult` — Complete ISO metric fastener set — bolt, nut, optional washers, and matching hole cutters.

  Returns all geometry for one bolted joint: the bolt, nut, up to two washers, a clearance-hole cutter, and a tap-drill cutter. All shapes are returned **un-positioned** (each on the Z-axis). Place them with `.translate()`.

  Sizes outside M4–M10 are supported for the washer (M2–M10); unsupported combinations will throw.

  ```ts
  const hw = lib.fastenerSet('M5', 20);

  const topPlate = box(60, 40, 8).translate(0, 0, 12)
    .subtract(hw.clearanceHole.translate(15, 10, 12));
  const botPlate = box(60, 40, 8)
    .subtract(hw.clearanceHole.translate(15, 10, 0));

  return [
    { name: 'Top Plate', shape: topPlate },
    { name: 'Bot Plate', shape: botPlate },
    { name: 'Bolt',      shape: hw.bolt.translate(15, 10, 20) },
    { name: 'Nut',       shape: hw.nut.translate(15, 10, -4) },
  ];
  ```
- `pipeRoute(points: Vec3[], radius: number, options?: { bendRadius?: number; wall?: number; segments?: number; }): Shape` — Route a pipe (solid or hollow) through 3D waypoints with smooth bends.

  This is a convenience recipe over `Curve.Route.fromPolyline()` and [`sweep()`](/docs/curves#sweep). Use `Curve.Route` directly when you need route metadata, named ports, or custom swept profiles.
- `elbow(pipeRadius: number, bendRadius: number, angle?: number | { ... }, options?: { ... }): Shape` — Pipe elbow — a curved pipe section for connecting two pipe directions.

  This is a convenience recipe over `Curve.Arc()` and [`sweep()`](/docs/curves#sweep). Use `Curve.Route.fromPolyline()` directly when you need named route ports, segment metadata, or multi-bend pipe runs.
- `beltDrive(options: BeltDriveOptions): BeltDriveResult` — Create a flat open-belt body around two pulley pitch circles.

  The belt is generated as a tangent loop in the XY plane and extruded along +Z by `beltWidth`. The result includes the solid belt, the 2D belt profile, a thin pitch-path sketch for visualization, total belt length, tangent spans, and wrap metadata for each pulley.

  For more than two pulleys, the API intentionally asks for route intent before geometry is created. Use `route: "outer"` for the future outside-envelope mode, or an ordered route for future serpentine/idler layouts.

  ```ts
  const drive = lib.beltDrive({
    pulleys: [
      { name: "motor", center: [0, 0], pitchRadius: 12 },
      { name: "output", center: [80, 0], pitchRadius: 28 },
    ],
    beltWidth: 8,
    beltThickness: 2,
  });
  return drive.belt;
  ```
- `tangentLoop2d(circles: TangentCircle2D[], options?: TangentLoop2DOptions): TangentLoop2D` — Build a closed 2D route made from common tangent spans and pulley wrap arcs.

  Use this when you need reusable belt/chain route geometry before creating a solid body. The first implementation supports two circles. `mode: "open"` uses external tangents; `mode: "crossed"` uses internal tangents.

  ```ts
  const route = lib.tangentLoop2d([
    { center: [0, 0], radius: 12 },
    { center: [80, 0], radius: 28 },
  ]);
  const belt = route.offsetBand(2).extrude(8);
  ```
- `tSlotProfile(options?: TSlotProfileOptions): Sketch` — Build a 2D T-slot cross-section sketch.

  Default parameters describe a 20x20 B-type profile with slot 6. Use this when you want a drawing-ready profile sketch before extrusion.
- `tSlotExtrusion(length: number, options?: TSlotExtrusionOptions): Shape` — Build a T-slot extrusion from the generated 2D profile. Extrudes along +Z by default.
- `profile2020BSlot6Profile(options?: Profile2020BSlot6ProfileOptions): Sketch` — Accurate-ish 2D profile for 20x20 B-type slot 6.

  Returns a drawing-ready Sketch centered at origin.
- `profile2020BSlot6(length: number, options?: Profile2020BSlot6Options): Shape` — 20x20 B-type slot 6 extrusion with profile-accurate defaults.

  Pass option overrides if your supplier's profile differs slightly.
- `spurGear(options: SpurGearOptions): Shape` — Involute external spur gear with optional center bore.

  Specify module, teeth, faceWidth as required parameters. Optional tuning includes pressureAngleDeg (default 20), backlash, clearance, addendum, dedendum, boreDiameter, and segmentsPerTooth (default 10).

  **Connectors (for assembly-based positioning):**

  - `bore`: revolute connector at the bore center, axis along +Z. Carries measurements: `{ module, teeth, pitchRadius, outerRadius, faceWidth }`.

  Use `.connect("Housing.seat", "Gear.bore")` to mount a gear on a shaft seat.
- `bevelGear(options: BevelGearOptions): Shape` — Conical bevel gear generated from a tapered involute extrusion. Specify pitchAngleDeg directly or derive it from mateTeeth + shaftAngleDeg.

  **Connectors (for assembly-based positioning):**

  - `bore`: revolute connector at the large-end bore center (Z=0), axis along -Z (away from teeth).
  - `apex`: connector at the cone apex above the gear (the point where the pitch cone converges), axis along +Z. Useful for meshing two bevel gears — their apices should coincide.

  Carries measurements: `{ module, teeth, pitchRadius, pitchAngleDeg, coneDistance, faceWidth }`.
- `faceGear(options: FaceGearOptions): Shape` — Face gear (crown style) where the teeth project axially from one face (top or bottom) of the disk instead of the outer cylindrical rim.

  Uses the same involute tooth sizing as spurGear, then projects the tooth band axially from the chosen side (`side`, default `'top'`) with axial tooth height `toothHeight` (default: one module). To mesh it with a perpendicular spur pinion, prefer `lib.faceGearPair()` — it rotates and positions the pinion at the face tooth band for you.

  **Connectors (for assembly-based positioning):**

  - `bore`: revolute connector at the bore center on the body side (the face opposite the teeth), axis pointing away from the teeth. Carries measurements: `{ module, teeth, pitchRadius, outerRadius, faceWidth, toothSide }`.

  ```js
  const crown = lib.faceGear({ module: 1.5, teeth: 30, faceWidth: 5, boreDiameter: 6 });
  assembly().connect("Housing.crown_seat", "Crown.bore");
  ```
- `ringGear(options: RingGearOptions): Shape` — Internal ring gear with involute-derived tooth spaces. Specify rimWidth or outerDiameter for the annular body.

  **Connectors (for assembly-based positioning):**

  - `bore`: connector at the ring center, axis along +Z. For planetary gearboxes, this is where the ring mounts to the housing. Carries measurements: `{ module, teeth, pitchRadius, innerRadius, outerRadius, faceWidth }`.
- `rackGear(options: RackGearOptions): Shape` — Linear rack gear with pressure-angle flanks. Use with spurGear for rack-and-pinion mechanisms.

  **Orientation:** teeth run along the X axis with tooth tips pointing +Y (pitch line at Y=0). The rack is extruded +Z by `faceWidth`. Rotate the rack to align with a different slide axis.

  **Connectors (for assembly-based positioning):**

  - `teeth`: prismatic connector at the pitch line center, axis along +X (slide direction). Carries measurements: `{ module, teeth, faceWidth, length }`.

  Connect to a housing's rack channel:

  ```js
  housing.withConnectors({
    rack_channel: connector("rack-channel", {
      origin: [pitchR, 0, channelZ], axis: [1, 0, 0], kind: "prismatic",
    }),
  });
  assembly.connect("Housing.rack_channel", "Rack.teeth", { as: "slide" });
  ```
- `gearPair(options: GearPairOptions): GearPairResult` — Build or validate a spur-gear pair and return ratio, backlash, and mesh diagnostics.

  Accepts either shapes from spurGear() or analytical specs for each member. When place is true (default), the gear is auto-positioned at the correct center distance.
- `bevelGearPair(options: BevelGearPairOptions): BevelGearPairResult` — Build or validate a bevel-gear pair and return ratio diagnostics plus recommended joint placement vectors.
- `faceGearPair(options: FaceGearPairOptions): FaceGearPairResult` — Pair helper for a face (crown) gear + perpendicular "vertical" spur gear. Auto-placement rotates the spur around +Y and positions it to mesh at the face tooth band.
- `gearRatio(teethA: number, teethB: number, options?: { internal?: boolean; }): number` — Coupling ratio between two meshed spur gears.

  When gear A turns 1°, gear B turns `-teethA / teethB` degrees (negative because meshed external gears rotate in opposite directions).

  ```js
  const drivenPerDriver = lib.gearRatio(12, 24); // -0.5
  verify.equal("external spur ratio", drivenPerDriver, -0.5);

  Pass `{ internal: true }` for internal gear pairs (ring gear + spur/planet),
  where the two rotate in the same direction.
  ```
- `rackRatio(module: number, pinionTeeth: number): number` — Coupling ratio between a pinion and a rack.

  When the pinion rotates by `θ` degrees, the rack slides by `θ × (π × module × teeth / 360)` mm. Equivalently, 1mm of rack travel = `180 / (π × pitchRadius)` degrees of pinion rotation.

  ```js
  const pinionDegPerMm = lib.rackRatio(1.5, 12); // ~6.37 deg/mm
  ```
- `planetaryRatio(sunTeeth: number, ringTeeth: number): number` — Planetary gear reduction ratio when the ring is held fixed.

  Input: sun. Output: carrier. Ratio: `1 + ringTeeth / sunTeeth`. One turn of the sun produces `1 / ratio` turns of the carrier.
- `boltPattern(options: BoltPatternOptions): BoltPattern` — Define a bolt pattern once and cut it from multiple parts.

  ```js
  const bolts = lib.boltPattern({
    size: 'M5',
    positions: [[20, 15], [-20, 15], [20, -15], [-20, -15]],
  });

  const base  = bolts.cut(box(60, 50, 10), 12, { from: -1 });
  const cover = bolts.cut(box(60, 50, 3), 5, { from: -1 });
  // Same positions in both parts — guaranteed aligned.
  ```
- `driveWheel(options?: DriveWheelOptions): DriveWheelBuilder` — Start a composable exceptional gear or drive wheel.
- `readDriveWheelMeta(shape: Shape): DriveWheelMeta | null` — Read the functional-region metadata attached by `driveWheel().build()`.
- `sectorGear(options: SectorGearOptions): Shape` — Involute sector gear with teeth on only part of the pitch circle.

  Specify the full-circle pitch as `teethOnFullCircle`, then choose the active tooth window with `firstTooth` and `toothCount`. The body is separate from the tooth region: pass a `gearBody...` shape for spokes, hubs, and product styling, or omit it for a simple root-radius disk.

  ```ts
  const body = lib.gearBodies.spoked({
    outerRadius: 22, rimWidth: 3, hubDiameter: 10,
    spokeCount: 5, spokeWidth: 2.5, faceWidth: 8, boreDiameter: 5,
  });
  const sector = lib.sectorGear({
    module: 1.25, teethOnFullCircle: 36, toothCount: 10,
    faceWidth: 8, body,
  });
  ```
- `gearBodies: { ... }` — Gear body preset namespace: disk, diskWithHub, spoked, and fromProfile.

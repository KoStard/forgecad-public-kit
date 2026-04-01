# Part Library

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Pre-built fasteners, gears, pipes, structural profiles, and utility shapes. Access via `lib.*`.

## Functions

### Fasteners & Hardware

Pre-built fastener shapes and hole helpers. Access via `lib.*`.

#### `lib.boltHole()`

```ts
lib.boltHole(diameter: number, depth: number): Shape
```

Through-hole cylinder centered at origin, intended as a cutter (subtract from part).

#### `lib.fastenerHole()`

```ts
lib.fastenerHole(opts: FastenerHoleOptions): Shape
```

Standardized metric fastener hole (through-hole/tap drill + optional counterbore/countersink). Returns hole geometry intended as a cutter (subtract from part).

<details><summary><code>FastenerHoleOptions</code></summary>

```ts
interface FastenerHoleOptions {
  standard?: "iso-metric";
  size: MetricSize;
  fit?: FastenerFit;
  depth: number;
  depth: number;
  diameter?: number;
  diameter: number;
  angleDeg?: number;
  center?: boolean;
  segments?: number;
}
```

</details>

#### `lib.counterbore()`

```ts
lib.counterbore(holeDia: number, boreDia: number, boreDepth: number, totalDepth: number): Shape
```

Counterbore hole — through-hole with a wider recess at the top

#### `lib.hexNut()`

```ts
lib.hexNut(acrossFlats: number, height: number, holeDia: number): Shape
```

Hex nut via intersection of three rotated slabs with a center bore.

#### `lib.holePattern()`

```ts
lib.holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape
```

Grid of cylindrical holes intended as a cutter pattern (subtract from part).

#### `lib.thread()`

```ts
lib.thread(diameter: number, pitch: number, length: number, options?: { depth?: number; segments?: number; }): Shape
```

External thread via twisted extrusion — no SDF grid artifacts. The idea: build a cross-section that's a circle at the root diameter with one trapezoidal bump out to the crest diameter. Then twist-extrude it so the bump traces a helix. Manifold's extrude+twist produces clean structured geometry — quads split into triangles that follow the thread. Returns a threaded cylinder along +Z from z=0 to z=length.

#### `lib.bolt()`

```ts
lib.bolt(diameter: number, length: number, options?: { ... }): Shape
```

Hex bolt with real helical threads. Head at z=0..headHeight, shaft extends downward along -Z.

#### `lib.nut()`

```ts
lib.nut(diameter: number, options?: { pitch?: number; height?: number; acrossFlats?: number; segments?: number; }): Shape
```

Hex nut with threaded bore. Centered at origin, height along Z.

#### `lib.washer()`

```ts
lib.washer(size: MetricSize, options?: { standard?: WasherStandard; segments?: number; }): Shape
```

Flat washer (DIN 125-A by default). Returns a flat ring centered at the origin, thickness along Z. Use `size` to select a standard metric thread size.

#### `lib.fastenerSet()`

```ts
lib.fastenerSet(size: MetricSize, boltLength: number, options?: FastenerSetOptions): FastenerSetResult
```

Complete ISO metric fastener set — bolt, nut, optional washers, and matching hole cutters. All shapes are returned un-positioned (each centered on the Z-axis at z=0 or the convention described in `FastenerSetResult`). Place them yourself using `.translate()`.

<details><summary><code>FastenerSetOptions</code></summary>

```ts
interface FastenerSetOptions {
  /** Include a washer under the bolt head (default: true). */
  washerUnderHead?: boolean;
  /** Include a washer under the nut (default: true). */
  washerUnderNut?: boolean;
  /** Clearance hole fit (default: 'normal'). */
  fit?: FastenerFit;
  /** Thread segment count (default: 36). */
  segments?: number;
}
```

</details>

<details><summary><code>FastenerSetResult</code></summary>

```ts
interface FastenerSetResult {
  /** Hex bolt: head top at z=0, threaded shaft extends toward −Z by `boltLength`. */
  bolt: Shape;
  /** Hex nut centered at z=0. */
  nut: Shape;
  /** Flat washer centered at z=0. Null when washerUnderHead is false. */
  washerUnderHead: Shape | null;
  /** Flat washer centered at z=0. Null when washerUnderNut is false. */
  washerUnderNut: Shape | null;
  /** Clearance-hole cutter (cylinder) centered at z=0, for subtracting from a through-plate. */
  clearanceHole: Shape;
  /** Tap-drill cutter (cylinder) centered at z=0, for subtracting from a tapped plate. */
  tappedHole: Shape;
  /** Reference dimensions for BOM, placement calculations, and documentation. */
  dims: FastenerSetDimensions;
}
```

</details>

<details><summary><code>FastenerSetDimensions</code></summary>

```ts
interface FastenerSetDimensions {
  size: MetricSize;
  nominalDiameter: number;
  boltLength: number;
  clearanceDia: number;
  tapDia: number;
  nutAcrossFlats: number;
  nutHeight: number;
  washerOuterDia: number;
  washerInnerDia: number;
  washerThickness: number;
}
```

</details>

### Structural Profiles

Extrusion profiles for aluminum framing and similar applications. Access via `lib.*`.

#### `lib.tSlotProfile()`

```ts
lib.tSlotProfile(options?: TSlotProfileOptions): Sketch
```

Build a 2D T-slot cross-section sketch. Default parameters describe a 20x20 B-type profile with slot 6. Use this when you want a drawing-ready profile sketch before extrusion.

<details><summary><code>TSlotProfileOptions</code></summary>

```ts
interface TSlotProfileOptions {
  /** Outer profile size (square). */
  size?: number;
  /** Slot mouth width (the narrow opening at each side). */
  slotWidth?: number;
  /** Wider interior slot cavity width. Must be >= slotWidth. */
  slotInnerWidth?: number;
  /** Total slot depth from outer face inward. */
  slotDepth?: number;
  /** Depth of the narrow mouth before it widens into slotInnerWidth. */
  slotNeckDepth?: number;
  /** Outer shell wall thickness. */
  wall?: number;
  /** Central cross-web thickness. */
  web?: number;
  /** Center boss diameter (solid material around center bore). */
  centerBossDia?: number;
  /** Center bore diameter (for tapping/through-hole). Set 0 to disable. */
  centerBoreDia?: number;
  /** Outer corner radius. */
  outerCornerRadius?: number;
  /** Segment count used for circular features in 2D. */
  segments?: number;
}
```

</details>

#### `lib.tSlotExtrusion()`

```ts
lib.tSlotExtrusion(length: number, options?: TSlotExtrusionOptions): Shape
```

Build a T-slot extrusion from the generated 2D profile. Extrudes along +Z by default.


<details><summary><code>TSlotExtrusionOptions</code> extends TSlotProfileOptions</summary>

```ts
interface TSlotExtrusionOptions extends TSlotProfileOptions {
  /** Center the extrusion around Z=0 instead of starting at Z=0. */
  center?: boolean;
}
```

</details>

#### `lib.profile2020BSlot6Profile()`

```ts
lib.profile2020BSlot6Profile(options?: Profile2020BSlot6ProfileOptions): Sketch
```

Accurate-ish 2D profile for 20x20 B-type slot 6. Returns a drawing-ready Sketch centered at origin.

<details><summary><code>Profile2020BSlot6ProfileOptions</code></summary>

```ts
interface Profile2020BSlot6ProfileOptions {
  /** Slot mouth width. */
  slotWidth?: number;
  /** Wider inner slot width. */
  slotInnerWidth?: number;
  /** Slot depth from outer face. */
  slotDepth?: number;
  /** Depth of the narrow neck before widening into slotInnerWidth. */
  slotNeckDepth?: number;
  /** Center core bore diameter (set 0 to disable). */
  centerBoreDia?: number;
  /** Solid boss diameter around center bore (must exceed centerBoreDia when bore is enabled). */
  centerBossDia?: number;
  /** Width of diagonal ribs connecting center boss to corner regions. */
  diagonalWebWidth?: number;
  /** Outside corner radius. */
  outerCornerRadius?: number;
  /** Circle segment count. */
  segments?: number;
}
```

</details>

#### `lib.profile2020BSlot6()`

```ts
lib.profile2020BSlot6(length: number, options?: Profile2020BSlot6Options): Shape
```

20x20 B-type slot 6 extrusion with profile-accurate defaults. Pass option overrides if your supplier's profile differs slightly.


<details><summary><code>Profile2020BSlot6Options</code> extends Profile2020BSlot6ProfileOptions</summary>

```ts
interface Profile2020BSlot6Options extends Profile2020BSlot6ProfileOptions {
  /** Center the extrusion around Z=0 instead of starting at Z=0. */
  center?: boolean;
}
```

</details>

### Pipes & Routing

Create pipe runs, elbows, and tubes. Access via `lib.*`.

#### `lib.tube()`

```ts
lib.tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape
```

Rectangular tube / hollow box

#### `lib.pipe()`

```ts
lib.pipe(height: number, outerRadius: number, wall: number, segments?: number): Shape
```

Pipe — hollow cylinder

#### `lib.pipeRoute()`

```ts
lib.pipeRoute(points: [ number,
```

Route a pipe (solid or hollow) through 3D waypoints with smooth bends. Each interior waypoint gets a torus-section bend. Straight segments connect them. Returns a single unioned Shape.

#### `lib.elbow()`

```ts
lib.elbow(pipeRadius: number, bendRadius: number, angle?: number | { ... }, options?: { ... }): Shape
```

Pipe elbow — a curved pipe section (torus arc) for connecting two pipe directions. By default creates a bend in the XZ plane: incoming along +Z, outgoing rotated by `angle`. The bend starts at the origin, curving away from it.

### Gears

Parametric gear geometry with meshing analysis. Access via `lib.*`.

#### `lib.spurGear()`

```ts
lib.spurGear(options: SpurGearOptions): Shape
```

Involute external spur gear with optional center bore. Specify module, teeth, faceWidth as required parameters. Optional tuning includes pressureAngleDeg (default 20), backlash, clearance, addendum, dedendum, boreDiameter, and segmentsPerTooth (default 10).

<details><summary><code>SpurGearOptions</code></summary>

```ts
interface SpurGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  center?: boolean;
  segmentsPerTooth?: number;
}
```

</details>

#### `lib.bevelGear()`

```ts
lib.bevelGear(options: BevelGearOptions): Shape
```

Conical bevel gear generated from a tapered involute extrusion. Specify pitchAngleDeg directly or derive it from mateTeeth + shaftAngleDeg.

<details><summary><code>BevelGearOptions</code></summary>

```ts
interface BevelGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  pitchAngleDeg?: number;
  mateTeeth?: number;
  shaftAngleDeg?: number;
  center?: boolean;
  segmentsPerTooth?: number;
}
```

</details>

#### `lib.faceGear()`

```ts
lib.faceGear(options: FaceGearOptions): Shape
```

Face gear (crown style) where teeth are on one face (top or bottom) instead of the outer rim. Uses the same involute tooth sizing as spurGear, then projects the tooth band axially from one side. Alias for sideGear (which is kept for backward compatibility).


<details><summary><code>SideGearOptions</code> extends SpurGearOptions</summary>

```ts
interface SideGearOptions extends SpurGearOptions {
  side?: "top" | "bottom";
  toothHeight?: number;
}
```

</details>

<details><summary><code>FaceGearOptions</code> extends SideGearOptions</summary>

```ts
interface FaceGearOptions extends SideGearOptions {
}
```

</details>

#### `lib.sideGear()`

```ts
lib.sideGear(options: SideGearOptions): Shape
```

Crown/face style gear where the teeth project from one side of the disk instead of the outer cylindrical rim.

#### `lib.ringGear()`

```ts
lib.ringGear(options: RingGearOptions): Shape
```

Internal ring gear with involute-derived tooth spaces. Specify rimWidth or outerDiameter for the annular body.

<details><summary><code>RingGearOptions</code></summary>

```ts
interface RingGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  rimWidth?: number;
  outerDiameter?: number;
  center?: boolean;
  segmentsPerTooth?: number;
}
```

</details>

#### `lib.rackGear()`

```ts
lib.rackGear(options: RackGearOptions): Shape
```

Linear rack gear with pressure-angle flanks. Use with spurGear for rack-and-pinion mechanisms.

<details><summary><code>RackGearOptions</code></summary>

```ts
interface RackGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  baseHeight?: number;
  center?: boolean;
}
```

</details>

#### `lib.gearPair()`

```ts
lib.gearPair(options: GearPairOptions): GearPairResult
```

Build or validate a spur-gear pair and return ratio, backlash, and mesh diagnostics. Accepts either shapes from spurGear() or analytical specs for each member. When place is true (default), the gear is auto-positioned at the correct center distance.

<details><summary><code>GearPairOptions</code></summary>

```ts
interface GearPairOptions {
  pinion: Shape | GearPairSpec;
  gear: Shape | GearPairSpec;
  backlash?: number;
  centerDistance?: number;
  place?: boolean;
  phaseDeg?: number;
}
```

</details>

<details><summary><code>GearPairSpec</code></summary>

```ts
interface GearPairSpec {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth?: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  segmentsPerTooth?: number;
}
```

</details>

<details><summary><code>GearPairResult</code></summary>

```ts
interface GearPairResult {
  pinion: Shape;
  gear: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  workingPressureAngleDeg: number;
  contactRatio: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for the gear around its shaft axis for correct tooth mesh alignment. When `place: true` this is already baked into `gear`. When `place: false`, rotate the gear by this amount before positioning. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: "ok" | "warn" | "error";
}
```

</details>

<details><summary><code>GearPairDiagnostic</code></summary>

```ts
interface GearPairDiagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
}
```

</details>

#### `lib.bevelGearPair()`

```ts
lib.bevelGearPair(options: BevelGearPairOptions): BevelGearPairResult
```

Build or validate a bevel-gear pair and return ratio diagnostics plus recommended joint placement vectors.

<details><summary><code>BevelGearPairOptions</code></summary>

```ts
interface BevelGearPairOptions {
  pinion: Shape | BevelGearPairSpec;
  gear: Shape | BevelGearPairSpec;
  shaftAngleDeg?: number;
  backlash?: number;
  place?: boolean;
  phaseDeg?: number;
}
```

</details>


<details><summary><code>BevelGearPairSpec</code> extends GearPairSpec</summary>

```ts
interface BevelGearPairSpec extends GearPairSpec {
}
```

</details>

<details><summary><code>GearMeshPlacement</code></summary>

```ts
interface GearMeshPlacement {
}
```

</details>

<details><summary><code>BevelGearPairResult</code> extends GearMeshPlacement</summary>

```ts
interface BevelGearPairResult extends GearMeshPlacement {
  pinion: Shape;
  gear: Shape;
  shaftAngleDeg: number;
  pinionPitchAngleDeg: number;
  gearPitchAngleDeg: number;
  coneDistance: number;
  backlash: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for gear tooth mesh alignment. See GearPairResult.phaseDeg. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: "ok" | "warn" | "error";
}
```

</details>

#### `lib.faceGearPair()`

```ts
lib.faceGearPair(options: FaceGearPairOptions): FaceGearPairResult
```

Build or validate a perpendicular pair between a face gear and a vertical spur gear.

<details><summary><code>FaceGearPairOptions</code></summary>

```ts
interface FaceGearPairOptions {
  face: Shape | FaceGearSpec;
  vertical: Shape | GearPairSpec;
  backlash?: number;
  centerDistance?: number;
  meshPlaneZ?: number;
  place?: boolean;
  phaseDeg?: number;
}
```

</details>


<details><summary><code>SideGearSpec</code> extends GearPairSpec</summary>

```ts
interface SideGearSpec extends GearPairSpec {
  side?: "top" | "bottom";
  toothHeight?: number;
}
```

</details>

<details><summary><code>FaceGearSpec</code> extends SideGearSpec</summary>

```ts
interface FaceGearSpec extends SideGearSpec {
}
```

</details>

<details><summary><code>FaceGearPairResult</code></summary>

```ts
interface FaceGearPairResult {
  face: Shape;
  vertical: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  meshPlaneZ: number;
  radialOverlap: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for the vertical gear. See GearPairResult.phaseDeg. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: "ok" | "warn" | "error";
}
```

</details>

#### `lib.sideGearPair()`

```ts
lib.sideGearPair(options: SideGearPairOptions): SideGearPairResult
```

Pair helper for side (crown/face) gear + perpendicular "vertical" spur gear. Auto-placement rotates the spur around +Y and positions it to mesh at the side tooth band.

<details><summary><code>SideGearPairOptions</code></summary>

```ts
interface SideGearPairOptions {
  side: Shape | SideGearSpec;
  vertical: Shape | GearPairSpec;
  backlash?: number;
  centerDistance?: number;
  meshPlaneZ?: number;
  place?: boolean;
  phaseDeg?: number;
}
```

</details>

<details><summary><code>SideGearPairResult</code></summary>

```ts
interface SideGearPairResult {
  side: Shape;
  vertical: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  meshPlaneZ: number;
  radialOverlap: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for the vertical gear. See GearPairResult.phaseDeg. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: "ok" | "warn" | "error";
}
```

</details>

### Utility Shapes

Pre-built parametric shapes for common patterns. Access via `lib.*`.

#### `lib.roundedBox()`

```ts
lib.roundedBox(x: number, y: number, z: number, radius: number): Shape
```

Box with all 12 edges filleted.

#### `lib.bracket()`

```ts
lib.bracket(width: number, height: number, depth: number, thick: number, holeDia?: number): Shape
```

L-shaped mounting bracket with optional through-holes in both the base and wall.

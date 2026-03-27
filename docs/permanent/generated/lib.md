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

#### `lib.fastenerHole()`

```ts
lib.fastenerHole(opts: FastenerHoleOptions): Shape
```

#### `lib.counterbore()`

```ts
lib.counterbore(holeDia: number, boreDia: number, boreDepth: number, totalDepth: number): Shape
```

#### `lib.hexNut()`

```ts
lib.hexNut(acrossFlats: number, height: number, holeDia: number): Shape
```

#### `lib.holePattern()`

```ts
lib.holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape
```

#### `lib.thread()`

```ts
lib.thread(diameter: number, pitch: number, length: number, options?: { depth?: number; segments?: number; }): Shape
```

#### `lib.bolt()`

```ts
lib.bolt(diameter: number, length: number, options?: { ... }): Shape
```

#### `lib.nut()`

```ts
lib.nut(diameter: number, options?: { pitch?: number; height?: number; acrossFlats?: number; segments?: number; }): Shape
```

#### `lib.washer()`

```ts
lib.washer(size: MetricSize, options?: { standard?: WasherStandard; segments?: number; }): Shape
```

#### `lib.fastenerSet()`

```ts
lib.fastenerSet(size: MetricSize, boltLength: number, options?: FastenerSetOptions): FastenerSetResult
```

### Structural Profiles

Extrusion profiles for aluminum framing and similar applications. Access via `lib.*`.

#### `lib.tSlotProfile()`

```ts
lib.tSlotProfile(options?: TSlotProfileOptions): Sketch
```

#### `lib.tSlotExtrusion()`

```ts
lib.tSlotExtrusion(length: number, options?: TSlotExtrusionOptions): Shape
```

#### `lib.profile2020BSlot6Profile()`

```ts
lib.profile2020BSlot6Profile(options?: Profile2020BSlot6ProfileOptions): Sketch
```

#### `lib.profile2020BSlot6()`

```ts
lib.profile2020BSlot6(length: number, options?: Profile2020BSlot6Options): Shape
```

### Pipes & Routing

Create pipe runs, elbows, and tubes. Access via `lib.*`.

#### `lib.tube()`

```ts
lib.tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape
```

#### `lib.pipe()`

```ts
lib.pipe(height: number, outerRadius: number, wall: number, segments?: number): Shape
```

#### `lib.pipeRoute()`

```ts
lib.pipeRoute(points: [ number,
```

#### `lib.elbow()`

```ts
lib.elbow(pipeRadius: number, bendRadius: number, angle?: number | { ... }, options?: { ... }): Shape
```

### Gears

Parametric gear geometry with meshing analysis. Access via `lib.*`.

#### `lib.spurGear()`

```ts
lib.spurGear(options: SpurGearOptions): Shape
```

#### `lib.bevelGear()`

```ts
lib.bevelGear(options: BevelGearOptions): Shape
```

#### `lib.faceGear()`

```ts
lib.faceGear(options: FaceGearOptions): Shape
```

#### `lib.sideGear()`

```ts
lib.sideGear(options: SideGearOptions): Shape
```

#### `lib.ringGear()`

```ts
lib.ringGear(options: RingGearOptions): Shape
```

#### `lib.rackGear()`

```ts
lib.rackGear(options: RackGearOptions): Shape
```

#### `lib.gearPair()`

```ts
lib.gearPair(options: GearPairOptions): GearPairResult
```

#### `lib.bevelGearPair()`

```ts
lib.bevelGearPair(options: BevelGearPairOptions): BevelGearPairResult
```

#### `lib.faceGearPair()`

```ts
lib.faceGearPair(options: FaceGearPairOptions): FaceGearPairResult
```

#### `lib.sideGearPair()`

```ts
lib.sideGearPair(options: SideGearPairOptions): SideGearPairResult
```

### Utility Shapes

Pre-built parametric shapes for common patterns. Access via `lib.*`.

#### `lib.roundedBox()`

```ts
lib.roundedBox(x: number, y: number, z: number, radius: number): Shape
```

#### `lib.bracket()`

```ts
lib.bracket(width: number, height: number, depth: number, thick: number, holeDia?: number): Shape
```

# Viewport Runtime APIs

These APIs affect the viewer and scene presentation. They do not change the underlying model geometry contract, so they are not part of the required model-building reading set.

## `cutPlane(name, normal, offsetOrOptions?, options?)`

Define a named section plane for inspection.

**Parameters:**
- `name` (string) - label shown in the viewport controls
- `normal` (`[number, number, number]`) - direction toward the clipped side
- `offsetOrOptions` (number or object, optional):
  - number: plane offset from origin along `normal`
  - object: `{ offset?: number, exclude?: string | string[] }`
- `options` (object, optional; used with numeric offset):
  - `exclude` (`string | string[]`) - returned object `name` values to keep uncut

**Returns:** `void`

```javascript
const cutZ = param("Cut Height", 10, { min: -50, max: 50, unit: "mm" });

cutPlane("Inspection", [0, 0, 1], cutZ, {
  exclude: ["Probe", "Fasteners"],
});
```

Notes:
- planes are registered per script run
- viewport toggle state persists across parameter changes
- clipping is applied to returned named objects, so `exclude` only works when names are stable

## `explodeView(options?)`

Override how the viewport explode slider offsets returned objects.

**Parameters:**
- `enabled` (boolean) - disable explode offsets for this script when `false`
- `amountScale` (number) - multiply the UI explode amount
- `mode` (`'radial' | 'x' | 'y' | 'z' | [x, y, z]`) - default explode direction
- `axisLock` (`'x' | 'y' | 'z'`) - optional global axis lock
- `byName` (`Record<string, { stage?, direction?, axisLock? }>`)- per-object overrides keyed by returned object `name`

**Returns:** `void`

```javascript
explodeView({
  amountScale: 1.2,
  mode: 'radial',
  byName: {
    "Shaft": { direction: [1, 0, 0], stage: 1.6 },
    "Housing": { stage: 0.4 },
  },
});
```

## `jointsView(options?)`

Register viewport-only mechanism controls that animate returned objects without rerunning the script.

Use this when you want interactive articulation in the viewer but the geometry itself stays fixed.

Animation values are interpolated linearly between keyframes. Forge does **not**
auto-wrap revolute values across `-180/180` or `0/360` for you, because doing
that globally would break intentional multi-turn tracks.

**Key options:**
- `enabled`
- `joints`: `{ name, child, parent?, type?, axis?, pivot?, min?, max?, default?, unit? }[]`
- `couplings`: `{ joint, terms, offset? }[]`
- `animations`: `{ name, duration?, loop?, continuous?, keyframes }[]`
- `defaultAnimation`

```javascript
jointsView({
  joints: [
    {
      name: "Shoulder",
      child: "Upper Arm",
      parent: "Base",
      type: "revolute",
      axis: [0, -1, 0],
      pivot: [0, 0, 46],
      min: -30,
      max: 110,
      default: 15,
    },
  ],
  animations: [
    {
      name: "Walk Cycle",
      duration: 1.6,
      loop: true,
      keyframes: [
        { at: 0.0, values: { "Shoulder": 20 } },
        { at: 0.5, values: { "Shoulder": -10 } },
        { at: 1.0, values: { "Shoulder": 20 } },
      ],
    },
  ],
});
```

`continuous: true` is for looping tracks that should keep accumulating across
cycles instead of snapping back to the first keyframe each time. Use it for
monotonic multi-turn drives such as `0 -> 360 -> 720`.

### Animation continuity for revolute joints

If an animation channel comes from `atan2(...)`, `normalizeAngleDeg(...)`, or
any other wrapped angle source, keep the sampled keyframes continuous before
passing them to `jointsView()`.

Bad branch-cut sample stream:

```javascript
keyframes: [
  { at: 0.48, values: { "Power Rod": -171 } },
  { at: 0.50, values: { "Power Rod": -180 } },
  { at: 0.52, values: { "Power Rod": 171 } },
]
```

That `-180 -> 171` jump is interpreted literally and the viewer will spin the
part the long way around.

Good continuous sample stream:

```javascript
keyframes: [
  { at: 0.48, values: { "Power Rod": -171 } },
  { at: 0.50, values: { "Power Rod": -180 } },
  { at: 0.52, values: { "Power Rod": -189 } },
]
```

Guidelines:
- Keep high-speed multi-turn joints authored as continuous angles (`0`, `360`,
  `720`, etc.).
- Only unwrap channels that represent cyclic angles. Do not apply angle
  unwrapping blindly to prismatic or other scalar values.
- If you build sampled helper utilities, let them unwrap a named set of joints
  instead of guessing from every numeric channel.

## `viewConfig(options?)`

Configure viewport helper visuals for the current script.

Current support:
- `jointOverlay.enabled`
- joint overlay colors such as `axisColor`, `axisCoreColor`, `arcColor`, `zeroColor`
- joint overlay sizing and tessellation controls such as `axisLengthScale`, `arcVisualLimitDeg`, `arcStepDeg`

**Returns:** `void`

```javascript
viewConfig({
  jointOverlay: {
    axisColor: "#13dfff",
    arcColor: "#ff7a1a",
    axisLineRadiusScale: 0.03,
    arcLineRadiusScale: 0.022,
  },
});
```

## `lib.explode(items, options?)`

Apply deterministic exploded-view offsets to an assembly tree while preserving names, colors, and nesting.

Works with:
- arrays of shapes/sketches/named items
- nested `{ name, group: [...] }` structures
- `ShapeGroup` outputs

**Parameters:**
- `items` (`ExplodeItem[] | ShapeGroup`)
- `options`:
  - `amount` (number)
  - `stages` (number[])
  - `mode` (`'radial' | 'x' | 'y' | 'z' | [x, y, z]`)
  - `axisLock` (`'x' | 'y' | 'z'`)
  - `byName`
  - `byPath`

Named items may also include:
- `explode: { stage?, direction?, axisLock? }`

**Returns:** same structure type as input, with translated geometry

```javascript
const explodeAmt = param("Explode", 0, { min: 0, max: 40, unit: "mm" });

return lib.explode(assembly, {
  amount: explodeAmt,
  stages: [0.4, 0.8],
  mode: 'radial',
  byName: {
    "Shaft": { direction: [1, 0, 0], stage: 1.4 },
  },
});
```

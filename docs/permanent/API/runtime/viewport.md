# Viewport Runtime APIs

These APIs affect the viewer and scene presentation. They do not change the underlying model geometry contract, so they are not part of the required model-building reading set.

## `scene(options)`

Control the full visual environment — camera, lighting, background, fog, and post-processing. Essential for generative art, presentations, and dramatic renders.

When `scene()` is called, it **replaces** the default viewer settings for the specified properties. Properties not specified keep their defaults. Multiple calls merge (later overrides earlier).

**Parameters:**
- `background` (string or `{ top, bottom }`) — solid color (`'#0a0a0a'`) or vertical gradient
- `camera` (object):
  - `position` (`[x, y, z]`) — camera world position (overrides auto-framing)
  - `target` (`[x, y, z]`) — look-at point
  - `fov` (number) — field of view in degrees (1–179)
  - `up` (`[x, y, z]`) — up vector (default `[0, 0, 1]`)
  - `type` (`'perspective' | 'orthographic'`)
- `lights` (array) — **replaces** all default lights. Each entry:
  - `type` (`'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'`) — required
  - `color` (string) — CSS color
  - `intensity` (number)
  - `position` (`[x, y, z]`) — for directional, point, spot
  - `target` (`[x, y, z]`) — for directional, spot
  - `groundColor` / `skyColor` (string) — for hemisphere
  - `angle` (number) — spot cone angle in radians
  - `penumbra` (number, 0–1) — spot penumbra
  - `decay` (number) — point/spot light decay
  - `distance` (number) — point/spot max range (0 = infinite)
  - `castShadow` (boolean)
- `environment` (object):
  - `preset` (`'studio' | 'sunset' | 'dawn' | 'warehouse' | 'forest' | 'apartment' | 'lobby' | 'city' | 'park' | 'night' | 'none'`)
  - `intensity` (number) — environment map intensity
  - `background` (boolean) — use environment map as scene background
- `fog` (object):
  - `color` (string)
  - `near` / `far` (number) — linear fog
  - `density` (number) — if set, uses exponential fog instead of linear
- `postProcessing` (object):
  - `bloom` — `{ intensity?, threshold?, radius? }`
  - `vignette` — `{ darkness?, offset? }`
  - `grain` — `{ intensity? }`
  - `toneMappingExposure` (number)
- `ground` (object):
  - `visible` (boolean)
  - `color` (string)
  - `height` (number) — Z offset
  - `receiveShadow` (boolean)
- `capture` (object) — default capture parameters for `forgecad capture`; CLI flags override these:
  - `framesPerTurn` (number, 12–720) — frames for one orbit rotation (default: 72)
  - `holdFrames` (number, 0–300) — frozen frames before motion (default: 6)
  - `pitchDeg` (number, -80–80) — orbit pitch angle (default: auto from camera)
  - `fps` (number, 1–60) — output frame rate (default: 24)
  - `size` (number) — output frame size in pixels (default: 960)
  - `background` (string) — canvas background color (default: '#252526')

**Returns:** `void`

```javascript
scene({
  background: { top: '#000814', bottom: '#001d3d' },

  camera: {
    position: [160, -120, 100],
    target: [0, 0, 50],
    fov: 52,
  },

  lights: [
    { type: 'ambient', color: '#001233', intensity: 0.08 },
    { type: 'point', position: [120, -80, 130], color: '#00f5d4', intensity: 4, distance: 400, decay: 1 },
    { type: 'point', position: [-100, 60, 20], color: '#f72585', intensity: 3, distance: 350 },
    { type: 'directional', position: [50, -30, 200], color: '#ffd60a', intensity: 1.2 },
    { type: 'hemisphere', skyColor: '#003566', groundColor: '#000814', intensity: 0.2 },
  ],

  fog: { color: '#000814', near: 100, far: 450 },

  postProcessing: {
    bloom: { intensity: param('bloom', 1.5, 0, 4), threshold: 0.5, radius: 0.7 },
    vignette: { darkness: 0.8, offset: 0.25 },
    grain: { intensity: 0.08 },
    toneMappingExposure: param('exposure', 1.5, 0.5, 4),
  },
});
```

Notes:
- All values work with `param()` for real-time slider control
- When `lights` is specified, **all** default lights are removed — you must provide your own ambient light or the scene will be very dark
- Post-processing (bloom, vignette, grain) works in the browser viewport only — CLI renders apply camera, lights, background, fog, and exposure but not shader-based effects
- Camera `position` overrides the auto-frame behavior — the viewport will not auto-fit the geometry to view
- See `examples/generative-art/` for full demos

## `shape.material(props)`

Set per-object material properties for controlling visual appearance. Returns a new Shape with the specified material properties. Material properties survive transforms (translate, rotate, scale, etc.) and boolean operations.

**Parameters (all optional):**
- `metalness` (number, 0–1) — metallic vs. dielectric appearance. Default: 0.05
- `roughness` (number, 0–1) — surface roughness (0 = mirror, 1 = matte). Default: 0.35
- `emissive` (string) — glow color (hex string, e.g. `'#ff6b35'`)
- `emissiveIntensity` (number) — glow multiplier. Default: 1
- `opacity` (number, 0–1) — transparency. Default: 1
- `wireframe` (boolean) — render as wireframe. Default: false
- `clearcoat` (number, 0–1) — clearcoat layer intensity. Default: 0.1
- `clearcoatRoughness` (number, 0–1) — clearcoat roughness. Default: 0.4

**Returns:** `Shape`

```javascript
// Polished metal
box(50, 50, 50).material({ metalness: 0.9, roughness: 0.1 });

// Glowing emissive
sphere(30).material({ emissive: '#ff6b35', emissiveIntensity: 2 });

// Translucent ice
cylinder(40, 20).material({ opacity: 0.4, clearcoat: 1.0, clearcoatRoughness: 0.02 });

// Chainable with other methods
box(100, 100, 10)
  .color('#gold')
  .material({ metalness: 0.95, roughness: 0.05 })
  .translate(0, 0, 50);
```

Notes:
- Material properties are per-shape — each returned object can have different materials
- Works in both the browser viewport and CLI renderer
- `.color()` sets the base diffuse color; `.material()` controls how that color behaves under light
- Emissive color glows independently of lighting — great for generative art effects like bloom
- See `examples/generative-art/molten-forge.forge.js` and `frost-spires.forge.js` for full demos

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
- newly exposed section faces render with a hatched overlay; pre-existing coplanar boundary faces are left unhatched

## `explodeView(options?)`

Override how the viewport explode slider offsets returned objects.

Explode offsets are resolved from the returned object tree, not from a flat list.
In `radial` mode each node follows its parent branch direction, then adds a smaller
local fan from the immediate parent/subassembly center, so nested assemblies peel
apart level by level without losing their branch structure.

In fixed-axis or fixed-vector modes, the branch itself follows that axis/vector, but
nested descendants fan out perpendicular to the branch by default so deep trees do
not keep stacking farther along the same axis.

By default this is container-oriented: named groups/subassemblies advance along the
tree, while plain leaves inside a group stay much closer and mostly fan locally
around their parent cluster unless you override them explicitly.

**Parameters:**
- `enabled` (boolean) - disable explode offsets for this script when `false`
- `amountScale` (number) - multiply the UI explode amount
- `stages` (number[]) - per-depth multipliers (depth 1 = first level, defaults to `1, 1/2, 1/3, ...`)
- `mode` (`'radial' | 'x' | 'y' | 'z' | [x, y, z]`) - default explode direction
- `axisLock` (`'x' | 'y' | 'z'`) - optional global axis lock
- `byName` (`Record<string, { stage?, direction?, axisLock? }>`)- per-object overrides keyed by returned object `name`
- `byPath` (`Record<string, { stage?, direction?, axisLock? }>`)- per-tree-path overrides using slash-separated object tree paths such as `"Drive/Shaft"`

**Returns:** `void`

```javascript
explodeView({
  amountScale: 1.2,
  stages: [0.35, 0.8],
  mode: 'radial',
  byPath: {
    "Drive/Shaft": { direction: [1, 0, 0], stage: 1.6 },
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
- `joints`: `{ name, child, parent?, type?, axis?, pivot?, min?, max?, default?, unit? }[]` — `min`/`max` control the slider range in the UI; they do **not** clamp animation keyframe values
- `couplings`: `{ joint, terms, offset? }[]`
- `animations`: `{ name, duration?, loop?, continuous?, keyframes }[]`
- `defaultAnimation`

**Keyframe `at` is optional (tick-based mode):** If you omit `at` from all
keyframes, they are spaced across the timeline as sequential ticks. By default
all ticks are equal, but you can use `ticks` to weight individual segments:

```javascript
keyframes: [
  { ticks: 3, values: { "Shoulder": 20 } },   // slow move (3× weight)
  { ticks: 1, values: { "Shoulder": -10 } },   // fast snap (1× weight)
  { values: { "Shoulder": 20 } },               // last keyframe's ticks is ignored
]
// Positions: 0, 0.75, 1.0  (weights 3,1 → total 4 → at 0/4, 3/4, 4/4)
```

You can still use explicit `at` values when you need precise non-uniform
spacing, but mixing explicit and omitted `at` within the same animation is not
allowed. `ticks` is only valid in tick-based mode.

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
        { values: { "Shoulder": 20 } },
        { values: { "Shoulder": -10 } },
        { values: { "Shoulder": 20 } },
      ],
    },
  ],
});
```

### Using `jointsView` with assemblies

When combining `jointsView` animations with an `assembly().solve()` pipeline, the assembly must be solved at **rest pose** (all animated joints = 0). The viewport applies `jointsView` transforms on top of the scene objects' existing positions — if the assembly is already solved at non-zero joint angles, the animation will double-rotate everything.

```javascript
// BAD — assembly bakes in slider angles, then jointsView rotates again
const solved = mech.solve({ shoulder: 45, elbow: 30 });
jointsView({
  joints: [{ name: "shoulder", child: "Upper Arm", ... }],
  animations: [{ ... keyframes with shoulder values ... }],
});
return solved; // double-rotated mess

// GOOD — assembly at rest, jointsView controls all posing
const solved = mech.solve({ shoulder: 0, elbow: 0 });
jointsView({
  joints: [
    { name: "shoulder", child: "Upper Arm", default: 45, ... },
    { name: "elbow", child: "Forearm", parent: "Upper Arm", default: 30, ... },
  ],
  animations: [{ ... }],
});
return solved; // jointsView handles static pose via defaults AND animation
```

**Pivot coordinates** are the world-space position of each joint origin at rest pose. For an assembly with `addRevolute("shoulder", "Base", "Link", { frame: Transform.identity().translate(0, 0, 20) })` where "Base" is at the world origin, the pivot is `[0, 0, 20]`.

For kinematic chains, child joint pivots are specified in the parent joint's rest-pose space — the viewport resolves them through the parent chain automatically.

**Fixed attachments** (e.g. an end effector bolted to the last link) need a zero-angle revolute joint in the `jointsView` chain so they follow the parent during animation:

```javascript
{ name: "EE_Follow", child: "End Effector", parent: "Last Link",
  type: "revolute", axis: [0, 0, 1], pivot: [linkLength, 0, 0],
  min: 0, max: 0, default: 0 }
```

**Slider-driven posing** still works: use `param()` for interactive angles, compute dependent joint values (FK/IK), and pass them as `default` values on the `jointsView` joints. When an animation plays it overrides the defaults; when stopped the slider defaults take over.

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

`radial` separation is branch-aware and parent-relative: each child follows the
direction of its parent branch, then fans out locally inside that branch. This keeps
subassemblies visually grouped while still letting their internals break apart.

For non-radial fixed-axis or fixed-vector modes, nested descendants keep the branch
offset but spread perpendicular to it by default.

Default behavior is tree-like rather than flat: containers separate recursively,
while unconfigured leaves inside a container use a smaller local fan so sibling parts
stay visually associated with their parent group.

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

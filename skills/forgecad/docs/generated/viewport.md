---
skill-group: viewport
skill-order: 100
---

# Viewport & Runtime

Cut planes, exploded views, joint animations, and scene configuration.

## Contents

- [Viewport & Runtime](#viewport-runtime) — `scene`, `viewConfig`, `explodeView`, `jointsView`, `cutPlane`, `mock`, `showLabels`, `highlight`
- [RouteBuilder](#routebuilder)
- [route](#route)

## Functions

### Viewport & Runtime

#### `scene()` — Configure the scene environment for the current script execution.

Controls camera position, named render views, optional model journeys, lighting rig, background color or gradient, atmospheric fog, environment maps, post-processing effects, and capture parameters for the `forgecad capture` command. Multiple calls merge — later values override earlier ones on a per-key basis, so you can split configuration across multiple `scene()` calls.

When `lights` is specified, **all** default lights are removed. You must include your own ambient light or the scene will be fully dark.

Setting `camera.position` overrides auto-framing — the viewport will no longer auto-fit the geometry on script reload.

Named render views let scripts check in repeatable cameras next to the model code. The canonical shape is `{ camera: { position, target } }`, and a direct camera shorthand `{ position, target }` is also accepted. Use the canonical shape when you may add view metadata later. Use it from the CLI with `forgecad render 3d model.forge.js --view hero`.

Model journeys let scripts check in a compact guided path through named objects. Each journey has ordered `steps`; each step can name a `focus` target by object name/tree path, provide a caption, and optionally provide an explicit camera. In the viewer, journeys are opt-in: they appear as a small Explore control and do not move the camera until the user starts them. Use `forgecad run model.forge.js --journeys` or `--journeys-json` to inspect resolved targets.

Post-processing effects (`bloom`, `vignette`, `grain`) work in the browser viewport only. The CLI applies camera, lights, background, fog, and `toneMappingExposure` but skips shader effects.

All numeric values accept `param()` expressions.

```js
scene({
  background: { top: '#000814', bottom: '#001d3d' },
  camera: { position: [160, -120, 100], target: [0, 0, 50], fov: 52 },
  views: {
    hero: {
      camera: { position: [180, -140, 90], target: [0, 0, 25], up: [0, 0, 1], fov: 38 },
    },
    side: { position: [240, 0, 70], target: [0, 0, 25], fov: 34 },
  },
  journeys: {
    grandTour: {
      title: 'Grand Tour',
      startsAt: 'overview',
      steps: [
        { id: 'overview', focus: 'Solar System', caption: 'Start with the whole model.' },
        { id: 'earth', focus: 'Earth', caption: 'Fit and inspect Earth.' },
      ],
    },
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

```ts
scene(options: SceneOptions): void
```

**`SceneOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `capture?` | `SceneCaptureConfig` | Default capture parameters for `forgecad capture` — CLI flags override these. |
| `background?`, `camera?`, `views?`, `journeys?`, `lights?`, `environment?`, `fog?`, `postProcessing?`, `ground?` | | — |

`SceneBackgroundGradient`: `{ top: string, bottom: string }`

**`SceneCameraConfig`**: `position?: [ number, number, number ]`, `target?: [ number, number, number ]`, `up?: [ number, number, number ]`, `fov?: number`, `type?: "perspective" | "orthographic"`

**`SceneJourneyConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `title?` | `string` | Viewer-facing journey title. Defaults to the journey id. |
| `startsAt?` | `string` | Optional starting step id. Defaults to the first step. |
| `behavior?` | `"opt-in" \| "auto"` | Whether the viewer should offer or auto-open the journey. First slice supports opt-in. |
| `steps` | `SceneJourneyStepConfig[]` | Ordered journey spine. Branches can be added later without changing this core contract. |
| `valid?` | `boolean` | True unless any journey or step diagnostic has level "error". |
| `diagnostics?` | `SceneJourneyDiagnostic[]` | Whole-journey diagnostics, including unresolved startsAt and step target diagnostics. |

**`SceneJourneyStepConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Stable step id used by viewer links and Next/Back state. |
| `title?` | `string` | Viewer-facing title. Defaults to the step id. |
| `focus?` | `string` | Object name or slash-separated tree path to focus. |
| `caption?` | `string` | Short optional viewer caption. |
| `camera?` | `SceneViewCameraConfig` | Optional explicit camera for this step. When omitted, the viewer fits `focus`. |
| `resolvedFocusId?` | `string \| null` | Resolved object id after script execution, when `focus` matched exactly one object. |
| `resolvedFocusPath?` | `string \| null` | Resolved object tree path or name after script execution. |
| `diagnostics?` | `SceneJourneyDiagnostic[]` | Resolution diagnostics for this step. |

`SceneJourneyDiagnostic`: `{ level: SceneJourneyDiagnosticLevel, message: string, stepId?: string, suggestions?: string[] }`

**`SceneLightConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `target?` | `[ number, number, number ]` | Target for directional/spot lights |
| `groundColor?` | `string` | Ground color for hemisphere lights |
| `skyColor?` | `string` | Sky color alias for hemisphere lights (same as color) |
| `angle?` | `number` | Spot light cone angle in radians |
| `penumbra?` | `number` | Spot light penumbra (0–1) |
| `decay?` | `number` | Point/spot light decay |
| `distance?` | `number` | Point/spot light distance (0 = infinite) |
| `castShadow?` | `boolean` | Whether this light casts shadows |
| `type`, `color?`, `intensity?`, `position?` | | — |

**`SceneEnvironmentConfig`**
- `preset?: "studio" | "sunset" | "dawn" | "warehouse" | "forest" | "apartment" | "lobby" | "city" | "park" | "night" | "none"` — Built-in preset name or 'none' to disable
- `intensity?: number` — Environment map intensity
- `background?: boolean` — Use environment map as scene background

**`SceneFogConfig`**
- `near?: number` — Linear fog near distance
- `far?: number` — Linear fog far distance
- `density?: number` — Exponential fog density (if set, uses FogExp2 instead of linear Fog)
- Also: `color?: string`

`ScenePostProcessingConfig`: `{ bloom?: SceneBloomConfig, vignette?: SceneVignetteConfig, grain?: SceneGrainConfig, toneMappingExposure?: number }`

`SceneBloomConfig`: `{ intensity?: number, threshold?: number, radius?: number }`

`SceneVignetteConfig`: `{ darkness?: number, offset?: number }`

`SceneGrainConfig`: `{ intensity?: number }`

**`SceneGroundConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `visible?` | `boolean` | Show a ground plane |
| `color?` | `string` | Ground color |
| `offset?` | `number` | Offset below the model's bounding box minimum Z. Default 0 (flush with model bottom). |
| `receiveShadow?` | `boolean` | Receive shadows on the ground |

**`SceneCaptureConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `framesPerTurn?` | `number` | Frames for one full orbit rotation (default: 72) |
| `holdFrames?` | `number` | Frozen frames before motion starts (default: 6) |
| `pitchDeg?` | `number` | Orbit pitch angle in degrees (default: auto from camera) |
| `fps?` | `number` | Output frame rate (default: 24) |
| `size?` | `number` | Output frame size in pixels (default: 960) |
| `background?` | `string` | Canvas background color for capture (default: '#252526') |

#### `viewConfig()` — Configure viewport helper visuals for the current script execution.

Controls renderer-only overlays that appear in the viewport but are not part of the geometry. Currently supports the joint overlay that renders axis arrows and arc indicators when `jointsView` is active. Multiple calls merge — later values override earlier ones per key.

This does **not** trigger a geometry recompute; it only affects the visual helpers drawn on top of the 3D scene.

```js
viewConfig({
  jointOverlay: {
    axisColor: '#13dfff',
    arcColor: '#ff7a1a',
    axisLineRadiusScale: 0.03,
    arcLineRadiusScale: 0.022,
  },
});
```

```ts
viewConfig(options?: ViewConfigOptions): void
```

`ViewConfigOptions`: `{ jointOverlay?: JointOverlayViewConfigOptions }`

**`JointOverlayViewConfigOptions`**: `enabled?: boolean`, `axisColor?: string`, `axisCoreColor?: string`, `arcColor?: string`, `zeroColor?: string`, `arcVisualLimitDeg?: number`, `axisLengthScale?: number`, `axisLengthMin?: number`, `axisLineRadiusScale?: number`, `axisLineRadiusMin?: number`, `axisLineRadiusMax?: number`, `spokeLineRadiusScale?: number`, `spokeLineRadiusMin?: number`, `spokeLineRadiusMax?: number`, `arcLineRadiusScale?: number`, `arcLineRadiusMin?: number`, `arcLineRadiusMax?: number`, `axisDotRadiusScale?: number`, `axisDotRadiusMin?: number`, `axisArrowRadiusScale?: number`, `axisArrowRadiusMin?: number`, `axisArrowLengthScale?: number`, `axisArrowLengthMin?: number`, `axisArrowOffsetFactor?: number`, `arcRadiusScale?: number`, `arcRadiusMin?: number`, `arcDotRadiusScale?: number`, `arcDotRadiusMin?: number`, `arcArrowRadiusScale?: number`, `arcArrowRadiusMin?: number`, `arcArrowLengthScale?: number`, `arcArrowLengthMin?: number`, `arcArrowOffsetFactor?: number`, `arcStepDeg?: number`, `arcMinSteps?: number`, `arcTubeSegmentsMin?: number`, `arcTubeSegmentsFactor?: number`, `arcTubeRadialSegments?: number`

#### `explodeView()` — Configure how the viewport explode slider offsets returned objects.

Offsets are resolved from the returned object tree, not a flat list. In `radial` mode each node follows its parent branch direction, then fans locally from the immediate parent center — nested assemblies peel apart level by level. In fixed-axis or fixed-vector modes, the branch follows that axis/vector but nested descendants fan out perpendicular by default.

Multiple calls merge — later values override earlier ones on a per-key basis. `byName` and `byPath` maps are merged entry-by-entry.

For programmatic explode applied before returning (without the slider), use `lib.explode()` instead.

```js
explodeView({
  amountScale: 1.2,
  stages: [0.35, 0.8],
  mode: 'radial',
  byPath: { 'Drive/Shaft': { direction: [1, 0, 0], stage: 1.6 } },
});
```

```ts
explodeView(options?: ExplodeViewOptions): void
```

**`ExplodeViewOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `enabled?` | `boolean` | Set false to disable viewport explode offsets for this script output. |
| `amountScale?` | `number` | Scales the UI explode amount. Default: 1 |
| `stages?` | `number[]` | Per-depth stage multipliers (depth 1 = first level). If depth exceeds this array, the last value is reused. Default when omitted: reciprocal depth (1, 1/2, 1/3, ...) |
| `mode?` | `ExplodeViewDirection` | Global direction mode fallback. Default: 'radial' |
| `axisLock?` | `ExplodeAxis` | Global axis lock fallback. |
| `byName?` | `Record<string, ExplodeViewDirective>` | Per-object overrides by final object name. |
| `byPath?` | `Record<string, ExplodeViewDirective>` | Per-tree-path overrides using slash-separated object tree segments. |

**`ExplodeDirective`**
- `stage?: number` — Multiplier applied to `amount` for this node
- `direction?: ExplodeDirection` — Direction mode for this node
- `axisLock?: ExplodeAxis` — Optional axis lock after direction is resolved

#### `jointsView()` — Register viewport-only mechanism controls that animate returned objects without re-running the script.

Defines joints (revolute or prismatic), optional gear/rack couplings, and named animations. The viewport resolves transforms through the joint chain at display time — the script geometry is computed only once at rest pose.

**Critical:** Solve the assembly at **rest pose** (all animated joints = 0). The viewport applies `jointsView` transforms on top of the returned scene. If geometry is already solved at non-zero angles, animation will double-rotate everything.

```js
// BAD — double rotation
const solved = mech.solve({ shoulder: 45, elbow: 30 });
jointsView({ joints: [{ name: 'shoulder', ... }] });
return solved;

// GOOD — rest pose, jointsView controls all posing
const solved = mech.solve({ shoulder: 0, elbow: 0 });
jointsView({
  joints: [
    { name: 'shoulder', child: 'Upper Arm', default: 45, ... },
    { name: 'elbow', child: 'Forearm', parent: 'Upper Arm', default: 30, ... },
  ],
});
return solved;
```

**Pivot coordinates** are world-space positions of each joint origin at rest pose. For `addRevolute('shoulder', 'Base', 'Link', { frame: Transform.identity().translate(0, 0, 20) })` where "Base" is at world origin, the pivot is `[0, 0, 20]`.

**Fixed attachments** that must follow a parent during animation need a zero-angle revolute joint in the chain:

```js
{ name: 'EE_Follow', child: 'End Effector', parent: 'Last Link',
  type: 'revolute', axis: [0, 0, 1], pivot: [linkLength, 0, 0],
  min: 0, max: 0, default: 0 }
```

Animation values are interpolated linearly between keyframes. ForgeCAD does **not** auto-wrap revolute values across `-180/180`. Keep keyframe values continuous — a `-180 -> 171` jump spins the part the long way around. Use `-180 -> -189` instead. Author high-speed multi-turn joints as accumulating angles (`0, 360, 720, ...`) with `continuous: true`.

**Tick-based keyframes:** Omit `at` from all keyframes to auto-distribute by tick weight:

```js
keyframes: [
  { ticks: 3, values: { Shoulder: 20 } },  // slow segment (3x weight)
  { ticks: 1, values: { Shoulder: -10 } }, // fast segment (1x weight)
  { values: { Shoulder: 20 } },            // last keyframe; ticks ignored
]
// positions: 0, 0.75, 1.0
```

Mixing explicit `at` and omitted `at` in the same animation is not allowed.

```js
jointsView({
  joints: [{
    name: 'Shoulder', child: 'Upper Arm', parent: 'Base',
    type: 'revolute', axis: [0, -1, 0], pivot: [0, 0, 46],
    min: -30, max: 110, default: 15,
  }],
  animations: [{
    name: 'Walk Cycle', duration: 1.6, loop: true,
    keyframes: [
      { values: { Shoulder: 20 } },
      { values: { Shoulder: -10 } },
      { values: { Shoulder: 20 } },
    ],
  }],
});
```

```ts
jointsView(options?: JointsViewOptions): void
```

**`JointsViewOptions`**: `enabled?: boolean`, `joints?: JointViewInput[]`, `couplings?: JointViewCouplingInput[]`, `animations?: JointViewAnimationInput[]`, `defaultAnimation?: string`

**`JointViewInput`**: `name: string`, `child: string`, `parent?: string`, `type?: JointViewType`, `axis?: JointViewAxis`, `pivot?: [ number, number, number ]`, `min?: number`, `max?: number`, `default?: number`, `unit?: string`, `hidden?: boolean`

`JointViewCouplingInput`: `{ joint: string, terms: JointViewCouplingTermInput[], offset?: number }`

`JointViewCouplingTermInput`: `{ joint: string, ratio?: number }`

`JointViewAnimationInput`: `{ name: string, duration?: number, loop?: boolean, continuous?: boolean, keyframes: JointViewAnimationKeyframeInput[] }`

**`JointViewAnimationKeyframeInput`**
- `at?: number` — Timeline position [0, 1]. If omitted from ALL keyframes, positions are auto-computed from tick weights.
- `ticks?: number` — Relative weight of the segment from this keyframe to the next (default 1). Only used in tick-based mode (when `at` is omitted). Last keyframe's ticks value is ignored.
- Also: `values: Record<string, number>`

#### `cutPlane()` — Define a named section plane for inspecting internal geometry.

Registers a cut plane that appears as a toggle in the viewport View Panel. When enabled, geometry on the positive side of the plane (the side the normal points toward) is clipped away, revealing the internal cross-section. The newly exposed section faces render with a hatched overlay; pre-existing coplanar boundary faces are left unhatched.

Planes are registered once per script run. The viewport toggle state (on/off) persists across parameter changes without re-running the script. The `exclude` option only works correctly when the excluded object names are stable across parameter changes.

Accepts two overloads: `cutPlane(name, normal, offset?, options?)` or `cutPlane(name, normal, options?)` where options may include `offset`.

```js
const cutZ = param('Cut Height', 10, { min: -50, max: 50, unit: 'mm' });
cutPlane('Inspection', [0, 0, 1], cutZ, { exclude: ['Probe', 'Fasteners'] });
```

Overloads:

- `cutPlane(name: string, normal: [ number, number, number ], offset?: number, options?: CutPlaneOptions): void`
- `cutPlane(name: string, normal: [ number, number, number ], options?: CutPlaneOptions): void`

**`CutPlaneOptions`**
- `offset?: number` — Optional offset along the plane normal (primarily for object-form overload).
- `exclude?: CutPlaneExcludeInput` — Object names to keep uncut for this plane.

#### `mock()` — Register a mock (context) object for visualization and collision checking.

Mock objects appear in the viewport and spatial analysis when you run a file directly, but are excluded when the file is imported via [`require()`](/docs/core#require). This lets you model the surrounding context — walls, bolts, mating parts — without polluting the module's exports.

The shape is returned unchanged, so you can reference it for alignment, dimensioning, and `verify` checks.

Mock objects participate in `forgecad run` collision detection and spatial analysis. Their names appear with a `(mock)` suffix in reports.

In the viewport, mock objects render at reduced opacity so they are visually distinct from real geometry.

```ts
// bracket.forge.js
const wall = mock(box(100, 200, 10).translate(0, 0, -5), "wall");
const bolt = mock(cylinder(3, 15).translate(10, 15, 0), "bolt");

const bracket = box(20, 30, 5);
verify.notColliding("bracket vs wall", bracket, wall);

return bracket;
// When imported: only bracket is exported
// When run directly: bracket + wall + bolt all visible
```

```ts
mock<T extends Shape>(shape: T, name?: string): T
```

#### `showLabels()` — Highlight all user-labeled faces on a shape for visual debugging.

Shows each user-authored label name in the viewport for visual debugging. Returns the shape unchanged for chaining: `return showLabels(myShape)`.

```ts
showLabels(shape: Shape): Shape
```

#### `highlight()` — Highlight any geometry for visual debugging in the viewport.

Supported inputs:

- `string` — sketch entity ID (e.g. `'L0'`, `'P0'`, `'C0'`)
- `[x, y, z]` — 3D point
- `[[x1,y1,z1], [x2,y2,z2]]` — edge (line segment)
- `{ normal: [x,y,z], offset: number }` — plane by normal + distance from origin
- `{ normal: [x,y,z], point: [x,y,z] }` — plane by normal + point on plane
- [`Shape`](/docs/core#shape) — highlight entire 3D shape
- `FaceRef` (from `shape.face('top')`) — highlight as plane at face center
- `EdgeRef` (from `shape.edge('left')`) — highlight as edge segment

Overloads:

- `highlight(entityId: string, opts?: HighlightOptions): void`
- `highlight(point: [ number, number, number ], opts?: HighlightOptions): void`
- `highlight(edge: [ [ number, number, number ], [ number, number, number ] ], opts?: HighlightOptions): void`
- `highlight(plane: { normal: [ number, number, number ]; offset: number; }, opts?: HighlightOptions): void`
- `highlight(plane: { normal: [ number, number, number ]; point: [ number, number, number ]; }, opts?: HighlightOptions): void`
- `highlight(shape: Shape, opts?: HighlightOptions): void`
- `highlight(face: FaceRef, opts?: HighlightOptions): void`
- `highlight(edge: EdgeRef, opts?: HighlightOptions): void`

**`HighlightOptions`**
- `size?: number` — Size hint for points (radius in mm) or planes (disc radius in mm).
- Also: `color?: string, label?: string, pulse?: boolean`

**`FaceRef`**

| Option | Type | Description |
|--------|------|-------------|
| `normal` | `[ number, number, number ]` | Normal direction of the face |
| `center` | `[ number, number, number ]` | Center point of the face |
| `query?` | `FaceQueryRef` | Compiler-owned face query when available. |
| `planar?` | `boolean` | True when the face can host a 2D sketch placement frame |
| `uAxis?` | `[ number, number, number ]` | Face-local horizontal axis for planar faces |
| `vAxis?` | `[ number, number, number ]` | Face-local vertical axis for planar faces |
| `descendant?` | `FaceDescendantMetadata` | Shared descendant-resolution metadata when this face is a semantic region/set. |
| `name` | | — |

**`FaceDescendantMetadata`**: `kind: "single" | "face-set"`, `semantic: FaceDescendantSemantic`, `memberCount: number`, `memberNames: string[]`, `coplanar: boolean`

**`EdgeRef`**
- `start: [ number, number, number ]` — Start point
- `end: [ number, number, number ]` — End point
- `query?: EdgeQueryRef` — Compiler-owned edge query when available.
- Also: `name: EdgeName`

---

## Classes

### `RouteBuilder`

#### `up()` — Vertical line going +Y. Length is optional (solver determines it from constraints).

```ts
up(length?: number): LineId
```

#### `down()` — Vertical line going -Y. Length is optional.

```ts
down(length?: number): LineId
```

#### `right()` — Horizontal line going +X. Length is optional.

```ts
right(length?: number): LineId
```

#### `left()` — Horizontal line going -X. Length is optional.

```ts
left(length?: number): LineId
```

#### `lineAt()` — Line at an arbitrary angle (degrees from +X). Length is optional.

```ts
lineAt(angleDeg: number, length?: number): LineId
```

#### [`line()`](/docs/sketch#line) — Line with solver-determined direction. Length is optional. Direction comes from tangency to previous arc or from constraints.

```ts
line(length?: number): LineId
```

#### `toward()` — Line toward a specific point. Length defaults to the distance to that point.

```ts
toward(x: number, y: number): LineId
```

#### `arcLeft()` — Tangent arc turning left relative to travel direction.

or `{ minSweep: degrees }` to seed the geometry without constraining. `minSweep` guides the solver to the correct branch for arcs that sweep more than the default 90° seed.

```ts
arcLeft(radius?: number, sweepDegOrOpts?: number | { minSweep: number; }): ArcId
```

#### `arcRight()` — Tangent arc turning right relative to travel direction.

or `{ minSweep: degrees }` to seed without constraining.

```ts
arcRight(radius?: number, sweepDegOrOpts?: number | { minSweep: number; }): ArcId
```

#### `close()` — Close the route with a straight line back to the start point.

```ts
close(): void
```

#### `done()` — Close the route back to its start point and register as a profile loop.

No extra line segment is added. A coincident constraint connects the last point to the start, and tangency is added for G1 smoothness when arcs are at the junction. The session's incremental solver processes these constraints, keeping seed positions accurate for the final solve.

```ts
done(): void
```

#### `start()` — PointId of the route's start point.

```ts
get start(): PointId
```

#### `end()` — PointId of the current cursor (route's end).

```ts
get end(): PointId
```

#### `startOf()` — Get the start point of a segment.

```ts
startOf(segId: LineId | ArcId): PointId
```

#### `endOf()` — Get the end point of a segment.

```ts
endOf(segId: LineId | ArcId): PointId
```

---

## Constants

### `route`

Route step factories. Access via `route.line()`, `route.fillet()`, etc.

---
skill-group: viewport
skill-order: 100
---

# Viewport & Runtime

Cut planes, exploded views, joint animations, and scene configuration.

## Contents

- [Viewport & Runtime](#viewport-runtime)
- [RouteBuilder](#routebuilder)
- [route](#route)

## Functions

### Viewport & Runtime

#### `Viewport.label(text: string, at: Vec3, options?: RenderLabelOptions): void` — Add a render-only viewport label at a world-space point.

`Viewport.label()` is for temporary review, debug, tutorial, or explicitly requested presentation overlays. It does not create sketches, meshes, B-rep topology, exported text, or face labels, so it stays off the OCCT path. Default production models should be understandable from physical geometry, materials, part boundaries, and named objects, not viewport annotations.

Use [`text2d()`](/docs/sketch#text2d) only when the letters should become manufactured geometry, such as raised lettering, engraved serial numbers, or exported nameplates.

Labels are collected during script execution and rendered by the viewport as lightweight overlay annotations. They are ignored by exports and do not appear in `objects`.

```js
Viewport.label('Bearing bore', [0, 0, 18], {
  color: '#f8fafc',
  background: '#0f172acc',
  offset: [0, 0, 8],
  anchor: 'bottom',
});

return box(40, 30, 12);
```

**`RenderLabelOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `color?` | `string` | Text color as any CSS color string. |
| `background?` | `string` | Background color as any CSS color string. Use `'transparent'` for no pill background. |
| `size?` | `number` | Font size in CSS pixels. Defaults to 12. |
| `offset?` | `Vec3` | Additional world-space offset from `at`. |
| `anchor?` | `RenderLabelAnchor` | Which point of the label box is anchored to `at`. Defaults to `'center'`. |
| `alwaysOnTop?` | `boolean` | When false, the label is hidden when occluded by scene geometry. Defaults to true. |

#### `Viewport.highlight(target: unknown, options?: HighlightOptions): void` — Highlight any geometry for visual debugging in the viewport.

`Viewport.highlight()` draws render-only debug overlays — distinctive colored markers that appear in the viewport but never become geometry, never export, and never appear in `objects`.

Supported inputs:

- `[x, y, z]` — 3D point
- `[[x1,y1,z1], [x2,y2,z2]]` — edge (line segment)
- `{ normal: [x,y,z], offset: number }` — plane by normal + distance from origin
- `{ normal: [x,y,z], point: [x,y,z] }` — plane by normal + point on plane
- [`Shape`](/docs/core#shape) — highlight an entire 3D shape
- `FaceRef` (from `shape.face('top')`) — highlight as plane at face center
- `EdgeRef` (from `shape.edge('left')`) — highlight as edge segment
- `string` — 2D sketch entity ID (e.g. `'L0'`, `'P0'`)

Pass `{ labels: true }` with a [`Shape`](/docs/core#shape) to annotate every user-authored labeled face with its name (the face-label debugging view).

```js
const b = box(30, 20, 15);
Viewport.highlight([0, 0, 0], { color: 'cyan', label: 'origin' });
Viewport.highlight(b.face('top'), { color: 'red' });
Viewport.highlight(b, { labels: true }); // annotate all user-labeled faces
return b;
```

**`HighlightOptions`**
- `size?: number` — Size hint for points (radius in mm) or planes (disc radius in mm).
- `labels?: boolean` — Shape inputs only: when true, annotate every user-authored labeled face with its label name (one plane highlight per labeled face). The whole-shape tint is added only when other visual options (`color`, `label`, `pulse`) are also passed.
- Also: `color?: string`, `label?: string`, `pulse?: boolean`.

#### `scene(options: SceneOptions): void` — Configure the scene environment for the current script execution.

Controls camera, named render views, guided journeys, lighting, background, fog, environment maps, capture defaults, and the joint-control helper overlay (`jointOverlay` — axis arrows and arc indicators, renderer-only). Multiple `scene()` calls merge per-key — later values win — so configuration can be split across calls.

Two behavioral cliffs:

- Specifying `lights` removes **all** default lights. Include your own ambient light or the scene is fully dark.
- Setting `camera.position` disables auto-framing — the viewport no longer auto-fits the geometry on script reload.

Named views are repeatable cameras checked in with the model code. Canonical shape is `{ camera: { position, target } }`; a direct `{ position, target }` shorthand is also accepted. Render one with `--view <name>` (see CLI docs).

Journeys are ordered `steps`, each focusing a returned object by name/tree path with an optional caption and camera. In the viewer they are opt-in (an Explore control; the camera does not move until started). Inspect resolved targets with `forgecad run --journeys`.

Post-processing is disabled for now while the browser EffectComposer flicker path is being rebuilt. Existing scripts that pass `postProcessing` continue running, but the option is not part of the active scene API.

All numeric values accept `param()` expressions.

```js
scene({
  background: { top: '#000814', bottom: '#001d3d' },
  camera: { position: [160, -120, 100], target: [0, 0, 50], fov: 52 },
  views: {
    hero: { camera: { position: [180, -140, 90], target: [0, 0, 25], fov: 38 } },
  },
  journeys: {
    tour: { steps: [{ id: 'earth', focus: 'Earth', caption: 'Fit and inspect Earth.' }] },
  },
  lights: [
    { type: 'ambient', color: '#001233', intensity: 0.08 },
    { type: 'directional', position: [50, -30, 200], color: '#ffd60a', intensity: 1.2 },
  ],
  fog: { color: '#000814', near: 100, far: 450 },
  jointOverlay: { axisColor: '#13dfff', arcColor: '#ff7a1a' },
});
```

**`SceneOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `capture?` | `SceneCaptureConfig` | Default capture parameters for `forgecad capture` — CLI flags override these. |

Also: `background?: string | SceneBackgroundGradient`, `camera?: SceneCameraConfig`, `views?: Record<string, SceneViewInputConfig>`, `journeys?: Record<string, SceneJourneyConfig>`, `lights?: SceneLightConfig[]`, `environment?: SceneEnvironmentConfig`, `fog?: SceneFogConfig`, `ground?: SceneGroundConfig`.

`SceneBackgroundGradient`: `{ top: string, bottom: string }`

`SceneCameraConfig`: `{ position?: Vec3, target?: Vec3, up?: Vec3, fov?: number, type?: "perspective" | "orthographic" }`

**`SceneJourneyConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `title?` | `string` | Viewer-facing journey title. Defaults to the journey id. |
| `startsAt?` | `string` | Optional starting step id. Defaults to the first step. |
| `behavior?` | `"opt-in" \| "auto"` | Whether the viewer should offer or auto-open the journey. First slice supports opt-in. |
| `steps` | `SceneJourneyStepConfig[]` | Ordered journey spine. Branches can be added later without changing this core contract. |
| `valid?` | `boolean` | True unless any journey or step diagnostic has level "error". |

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

**`SceneLightConfig`**

| Option | Type | Description |
|--------|------|-------------|
| `target?` | `Vec3` | Target for directional/spot lights |
| `groundColor?` | `string` | Ground color for hemisphere lights |
| `skyColor?` | `string` | Sky color alias for hemisphere lights (same as color) |
| `angle?` | `number` | Spot light cone angle in radians |
| `penumbra?` | `number` | Spot light penumbra (0–1) |
| `decay?` | `number` | Point/spot light decay |
| `distance?` | `number` | Point/spot light distance (0 = infinite) |
| `castShadow?` | `boolean` | Whether this light casts shadows |

Also: `type: SceneLightType`, `color?: string`, `intensity?: number`, `position?: Vec3`.

**`SceneEnvironmentConfig`**
- `preset?: "studio" | "sunset" | "dawn" | "warehouse" | "forest" | "apartment" | "lobby" | "city" | "park" | "night" | "none"` — Built-in preset name or 'none' to disable
- `intensity?: number` — Environment map intensity
- `background?: boolean` — Use environment map as scene background

**`SceneFogConfig`**
- `near?: number` — Linear fog near distance
- `far?: number` — Linear fog far distance
- `density?: number` — Exponential fog density (if set, uses FogExp2 instead of linear Fog)
- Also: `color?: string`.

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

#### `explodeView(options?: ExplodeViewOptions): void` — Configure how the viewport explode slider offsets returned objects.

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

#### `compareWith(path: string, options?: CompareWithOptions): void` — Declare a reference model for comparison inspection.

`compareWith()` lets a model carry its own comparison target for inspection workflows. `forgecad inspect compare overlay model.forge.js` uses this reference to render the same Difference Only comparison overlay as the live viewport. Amber marks candidate mismatch evidence, cyan marks reference mismatch evidence, and faint model context keeps the overlay readable. When the CLI can resolve the referenced file, the manifest also includes the same geometric score produced by `forgecad compare 3d`.

The path is resolved relative to the file that calls `compareWith()`. It may point to another `.forge.js` file or an imported CAD asset such as `.stl`, `.obj`, `.3mf`, `.step`, or `.stp`.

```js
compareWith('./reference.3mf', { align: 'center', toleranceMm: 0.25, samples: 3000 });
return rebuiltBearing;
```

**`CompareWithOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `align?` | `CompareAlignMode` | Candidate alignment before scoring. Defaults to no automatic alignment. |
| `toleranceMm?` | `number` | Distance tolerance in model units for coverage scoring. Defaults to the comparison scorer's auto tolerance. |
| `samples?` | `number` | Surface samples per direction for numeric scoring. Defaults to the comparison scorer's standard sample count. |
| `label?` | `string` | Human label for the reference model in inspection manifests. |

#### `cutPlane()` — Define a named section plane for inspecting internal geometry.

Overloads:

- `cutPlane(name: string, normal: Vec3, offset?: number, options?: CutPlaneOptions): void`
- `cutPlane(name: string, normal: Vec3, options?: CutPlaneOptions): void`

Registers a cut plane that appears as a toggle in the viewport View Panel. When enabled, geometry on the positive side of the plane (the side the normal points toward) is clipped away, revealing the internal cross-section. The newly exposed section faces render with a hatched overlay; pre-existing coplanar boundary faces are left unhatched.

Planes are registered once per script run. The viewport toggle state (on/off) persists across parameter changes without re-running the script. The `exclude` option only works correctly when the excluded object names are stable across parameter changes.

Accepts two overloads: `cutPlane(name, normal, offset?, options?)` or `cutPlane(name, normal, options?)` where options may include `offset`.

```js
const cutZ = param('Cut Height', 10, { min: -50, max: 50, unit: 'mm' });
cutPlane('Inspection', [0, 0, 1], cutZ, { exclude: ['Probe', 'Fasteners'] });
```

**`CutPlaneOptions`**
- `offset?: number` — Optional offset along the plane normal (primarily for object-form overload).
- `exclude?: CutPlaneExcludeInput` — Object names to keep uncut for this plane.

#### `mock<T extends Shape>(shape: T, name?: string): T` — Register a mock (context) object for visualization and inspection.

Mock objects appear in the viewport and inspection analysis when you run a file directly, but are excluded when the file is imported via [`require()`](/docs/core#require). This lets you model the surrounding context — walls, bolts, mating parts — without polluting the module's exports.

The shape is returned unchanged, so you can reference it for alignment, dimensioning, and `verify` checks.

Mock objects participate in focused inspection commands such as `forgecad inspect fit interference` and `forgecad inspect physical gaps`. Their names appear with a `(mock)` suffix in reports.

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

---

## Classes

### `RouteBuilder`

#### `up(length?: number): LineId` — Vertical line going +Y. Length is optional (solver determines it from constraints).

#### `down(length?: number): LineId` — Vertical line going -Y. Length is optional.

#### `right(length?: number): LineId` — Horizontal line going +X. Length is optional.

#### `left(length?: number): LineId` — Horizontal line going -X. Length is optional.

#### `lineAt(angleDeg: number, length?: number): LineId` — Line at an arbitrary angle (degrees from +X). Length is optional.

#### `line(length?: number): LineId` — Line with solver-determined direction. Length is optional. Direction comes from tangency to previous arc or from constraints.

#### `toward(x: number, y: number): LineId` — Line toward a specific point. Length defaults to the distance to that point.

#### `arcLeft(radius?: number, sweepDegOrOpts?: number | { minSweep: number; }): ArcId` — Tangent arc turning left relative to travel direction.

or `{ minSweep: degrees }` to seed the geometry without constraining. `minSweep` guides the solver to the correct branch for arcs that sweep more than the default 90° seed.

#### `arcRight(radius?: number, sweepDegOrOpts?: number | { minSweep: number; }): ArcId` — Tangent arc turning right relative to travel direction.

or `{ minSweep: degrees }` to seed without constraining.

#### `close(): void` — Close the route with a straight line back to the start point.

#### `done(): void` — Close the route back to its start point and register as a profile loop.

No extra line segment is added. A coincident constraint connects the last point to the start, and tangency is added for G1 smoothness when arcs are at the junction. The session's incremental solver processes these constraints, keeping seed positions accurate for the final solve.

#### `get start(): PointId` — PointId of the route's start point.

#### `get end(): PointId` — PointId of the current cursor (route's end).

#### `startOf(segId: LineId | ArcId): PointId` — Get the start point of a segment.

#### `endOf(segId: LineId | ArcId): PointId` — Get the end point of a segment.

---

## Constants

### `route`

Route step factories. Access via `route.line()`, `route.fillet()`, etc.

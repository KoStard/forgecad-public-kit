# Viewport & Runtime

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Cut planes, exploded views, joint animations, and scene configuration.

## Functions

### Viewport & Runtime

Configure viewport behavior: cut planes, exploded views, joint controls.

#### `jointsView()`

```ts
jointsView(options?: JointsViewOptions): void
```

Configure runtime joint controls that animate object transforms in the viewport without re-running the script.

<details><summary><code>JointsViewOptions</code></summary>

```ts
interface JointsViewOptions {
  enabled?: boolean;
  joints?: JointViewInput[];
  couplings?: JointViewCouplingInput[];
  animations?: JointViewAnimationInput[];
  defaultAnimation?: string;
}
```

</details>

<details><summary><code>JointViewInput</code></summary>

```ts
interface JointViewInput {
  name: string;
  child: string;
  parent?: string;
  type?: JointViewType;
  axis?: JointViewAxis;
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  hidden?: boolean;
}
```

</details>

<details><summary><code>JointViewCouplingInput</code></summary>

```ts
interface JointViewCouplingInput {
  joint: string;
  terms: JointViewCouplingTermInput[];
  offset?: number;
}
```

</details>

<details><summary><code>JointViewCouplingTermInput</code></summary>

```ts
interface JointViewCouplingTermInput {
  joint: string;
  ratio?: number;
}
```

</details>

<details><summary><code>JointViewAnimationInput</code></summary>

```ts
interface JointViewAnimationInput {
  name: string;
  duration?: number;
  loop?: boolean;
  continuous?: boolean;
  keyframes: JointViewAnimationKeyframeInput[];
}
```

</details>

<details><summary><code>JointViewAnimationKeyframeInput</code></summary>

```ts
interface JointViewAnimationKeyframeInput {
  /** Timeline position [0, 1]. If omitted from ALL keyframes, positions are auto-computed from tick weights. */
  at?: number;
  /** Relative weight of the segment from this keyframe to the next (default 1). Only used in tick-based mode (when `at` is omitted). Last keyframe's ticks value is ignored. */
  ticks?: number;
  values: Record<string, number>;
}
```

</details>

#### `explodeView()`

```ts
explodeView(options?: ExplodeViewOptions): void
```

Configure viewport exploded-view behavior for the current script execution. Multiple calls merge; later values override earlier ones.

<details><summary><code>ExplodeViewOptions</code></summary>

```ts
interface ExplodeViewOptions {
  /** Set false to disable viewport explode offsets for this script output. */
  enabled?: boolean;
  /** Scales the UI explode amount. Default: 1 */
  amountScale?: number;
  /** Per-depth stage multipliers (depth 1 = first level). If depth exceeds this array, the last value is reused. Default when omitted: reciprocal depth (1, 1/2, 1/3, ...) */
  stages?: number[];
  /** Global direction mode fallback. Default: 'radial' */
  mode?: ExplodeViewDirection;
  /** Global axis lock fallback. */
  axisLock?: ExplodeAxis;
  /** Per-object overrides by final object name. */
  byName?: Record<string, ExplodeViewDirective>;
  /** Per-tree-path overrides using slash-separated object tree segments. */
  byPath?: Record<string, ExplodeViewDirective>;
}
```

</details>

<details><summary><code>ExplodeDirective</code></summary>

```ts
interface ExplodeDirective {
  /** Multiplier applied to `amount` for this node */
  stage?: number;
  /** Direction mode for this node */
  direction?: ExplodeDirection;
  /** Optional axis lock after direction is resolved */
  axisLock?: ExplodeAxis;
}
```

</details>

<details><summary><code>ExplodeViewDirective</code> extends ExplodeDirective</summary>

```ts
interface ExplodeViewDirective extends ExplodeDirective {
}
```

</details>

#### `cutPlane()`

```ts
cutPlane(name: string, normal: [ number, number, number ], offset?: number, options?: CutPlaneOptions): void
```

Define a named section/cut plane. Appears as a toggle in the View Panel. When enabled, geometry on the positive side of the plane is clipped away.

<details><summary><code>CutPlaneOptions</code></summary>

```ts
interface CutPlaneOptions {
  /** Optional offset along the plane normal (primarily for object-form overload). */
  offset?: number;
  /** Object names to keep uncut for this plane. */
  exclude?: CutPlaneExcludeInput;
}
```

</details>

#### `cutPlane()`

```ts
cutPlane(name: string, normal: [ number, number, number ], options?: CutPlaneOptions): void
```

#### `scene()`

```ts
scene(options: SceneOptions): void
```

Configure the scene environment for the current script execution. Controls camera, lighting, background, fog, and post-processing. Multiple calls merge; later values override earlier ones. ```js scene({ background: '#0a0a0a', camera: { position: [200, 100, 150], target: [0, 0, 30], fov: 60 }, lights: [ { type: 'ambient', color: '#1a1a2e', intensity: 0.2 }, { type: 'point', position: [0, 0, 100], color: '#ff6b35', intensity: 2 }, ], fog: { color: '#0a0a0a', near: 100, far: 500 }, postProcessing: { bloom: { intensity: 1.5, threshold: 0.8, radius: 0.4 }, }, }); ```

<details><summary><code>SceneOptions</code></summary>

```ts
interface SceneOptions {
  background?: string | SceneBackgroundGradient;
  camera?: SceneCameraConfig;
  lights?: SceneLightConfig[];
  environment?: SceneEnvironmentConfig;
  fog?: SceneFogConfig;
  postProcessing?: ScenePostProcessingConfig;
  ground?: SceneGroundConfig;
  /** Default capture parameters for `forgecad capture` — CLI flags override these. */
  capture?: SceneCaptureConfig;
}
```

</details>

<details><summary><code>SceneBackgroundGradient</code></summary>

```ts
interface SceneBackgroundGradient {
  top: string;
  bottom: string;
}
```

</details>

<details><summary><code>SceneCameraConfig</code></summary>

```ts
interface SceneCameraConfig {
  fov?: number;
  type?: "perspective" | "orthographic";
}
```

</details>

<details><summary><code>SceneLightConfig</code></summary>

```ts
interface SceneLightConfig {
  type: SceneLightType;
  color?: string;
  intensity?: number;
  /** Ground color for hemisphere lights */
  groundColor?: string;
  /** Sky color alias for hemisphere lights (same as color) */
  skyColor?: string;
  /** Spot light cone angle in radians */
  angle?: number;
  /** Spot light penumbra (0–1) */
  penumbra?: number;
  /** Point/spot light decay */
  decay?: number;
  /** Point/spot light distance (0 = infinite) */
  distance?: number;
  /** Whether this light casts shadows */
  castShadow?: boolean;
}
```

</details>

<details><summary><code>SceneEnvironmentConfig</code></summary>

```ts
interface SceneEnvironmentConfig {
  /** Built-in preset name or 'none' to disable */
  preset?: "studio" | "sunset" | "dawn" | "warehouse" | "forest" | "apartment" | "lobby" | "city" | "park" | "night" | "none";
  /** Environment map intensity */
  intensity?: number;
  /** Use environment map as scene background */
  background?: boolean;
}
```

</details>

<details><summary><code>SceneFogConfig</code></summary>

```ts
interface SceneFogConfig {
  color?: string;
  /** Linear fog near distance */
  near?: number;
  /** Linear fog far distance */
  far?: number;
  /** Exponential fog density (if set, uses FogExp2 instead of linear Fog) */
  density?: number;
}
```

</details>

<details><summary><code>ScenePostProcessingConfig</code></summary>

```ts
interface ScenePostProcessingConfig {
  bloom?: SceneBloomConfig;
  vignette?: SceneVignetteConfig;
  grain?: SceneGrainConfig;
  toneMappingExposure?: number;
}
```

</details>

<details><summary><code>SceneBloomConfig</code></summary>

```ts
interface SceneBloomConfig {
  intensity?: number;
  threshold?: number;
  radius?: number;
}
```

</details>

<details><summary><code>SceneVignetteConfig</code></summary>

```ts
interface SceneVignetteConfig {
  darkness?: number;
  offset?: number;
}
```

</details>

<details><summary><code>SceneGrainConfig</code></summary>

```ts
interface SceneGrainConfig {
  intensity?: number;
}
```

</details>

<details><summary><code>SceneGroundConfig</code></summary>

```ts
interface SceneGroundConfig {
  /** Show a ground plane */
  visible?: boolean;
  /** Ground color */
  color?: string;
  /** Offset below the model's bounding box minimum Z. Default 0 (flush with model bottom). */
  offset?: number;
  /** Receive shadows on the ground */
  receiveShadow?: boolean;
}
```

</details>

<details><summary><code>SceneCaptureConfig</code></summary>

```ts
interface SceneCaptureConfig {
  /** Frames for one full orbit rotation (default: 72) */
  framesPerTurn?: number;
  /** Frozen frames before motion starts (default: 6) */
  holdFrames?: number;
  /** Orbit pitch angle in degrees (default: auto from camera) */
  pitchDeg?: number;
  /** Output frame rate (default: 24) */
  fps?: number;
  /** Output frame size in pixels (default: 960) */
  size?: number;
  /** Canvas background color for capture (default: '#252526') */
  background?: string;
}
```

</details>

#### `viewConfig()`

```ts
viewConfig(options?: ViewConfigOptions): void
```

Configure runtime viewport visuals for the current script execution. Multiple calls merge; later values override earlier ones.

<details><summary><code>ViewConfigOptions</code></summary>

```ts
interface ViewConfigOptions {
  jointOverlay?: JointOverlayViewConfigOptions;
}
```

</details>

<details><summary><code>JointOverlayViewConfigOptions</code></summary>

```ts
interface JointOverlayViewConfigOptions {
  enabled?: boolean;
  axisColor?: string;
  axisCoreColor?: string;
  arcColor?: string;
  zeroColor?: string;
  arcVisualLimitDeg?: number;
  axisLengthScale?: number;
  axisLengthMin?: number;
  axisLineRadiusScale?: number;
  axisLineRadiusMin?: number;
  axisLineRadiusMax?: number;
  spokeLineRadiusScale?: number;
  spokeLineRadiusMin?: number;
  spokeLineRadiusMax?: number;
  arcLineRadiusScale?: number;
  arcLineRadiusMin?: number;
  arcLineRadiusMax?: number;
  axisDotRadiusScale?: number;
  axisDotRadiusMin?: number;
  axisArrowRadiusScale?: number;
  axisArrowRadiusMin?: number;
  axisArrowLengthScale?: number;
  axisArrowLengthMin?: number;
  axisArrowOffsetFactor?: number;
  arcRadiusScale?: number;
  arcRadiusMin?: number;
  arcDotRadiusScale?: number;
  arcDotRadiusMin?: number;
  arcArrowRadiusScale?: number;
  arcArrowRadiusMin?: number;
  arcArrowLengthScale?: number;
  arcArrowLengthMin?: number;
  arcArrowOffsetFactor?: number;
  arcStepDeg?: number;
  arcMinSteps?: number;
  arcTubeSegmentsMin?: number;
  arcTubeSegmentsFactor?: number;
  arcTubeRadialSegments?: number;
}
```

</details>

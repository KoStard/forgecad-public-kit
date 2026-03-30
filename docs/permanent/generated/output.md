# Output & Annotations

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Dimensions, BOM entries, verification checks, and sketch export.

## Functions

### Annotations & Output

Add dimensions, BOM entries, verification checks, and robot export.

#### `bom()`

```ts
bom(quantity: number, description: string, opts?: BomOpts): void
```

Add a bill-of-materials entry.

<details><summary><code>BomOpts</code></summary>

```ts
interface BomOpts {
  /** Quantity unit label, e.g. "mm", "pieces", "kg". Default: "pieces" */
  unit?: string;
  /** Optional explicit grouping key used during report aggregation. */
  key?: string;
}
```

</details>

#### `robotExport()`

```ts
robotExport(options: RobotExportOptions): CollectedRobotExport
```

Declare that the current script should export an assembly as a robot package for the SDF CLI. Configures inertial properties, joint limits, and optional plugins (e.g. diff-drive for Gazebo).

<details><summary><code>RobotExportOptions</code></summary>

```ts
interface RobotExportOptions {
  assembly: Assembly;
  modelName?: string;
  state?: JointState;
  static?: boolean;
  selfCollide?: boolean;
  allowAutoDisable?: boolean;
  links?: Record<string, RobotLinkExportOptions>;
  joints?: Record<string, RobotJointExportOptions>;
  diffDrive?: RobotDiffDrivePluginOptions;
  jointStatePublisher?: RobotJointStatePublisherOptions;
  world?: RobotWorldOptions;
}
```

</details>

<details><summary><code>RobotLinkExportOptions</code></summary>

```ts
interface RobotLinkExportOptions {
  massKg?: number;
  densityKgM3?: number;
  collision?: "visual" | "convex" | "box" | "none";
}
```

</details>

<details><summary><code>RobotJointExportOptions</code></summary>

```ts
interface RobotJointExportOptions {
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}
```

</details>

<details><summary><code>RobotDiffDrivePluginOptions</code></summary>

```ts
interface RobotDiffDrivePluginOptions {
  leftJoints: string[];
  rightJoints: string[];
  wheelSeparationMm: number;
  wheelRadiusMm: number;
  topic?: string;
  odomTopic?: string;
  tfTopic?: string;
  frameId?: string;
  odomFrameId?: string;
  maxLinearVelocity?: number;
  maxAngularVelocity?: number;
  linearAcceleration?: number;
  angularAcceleration?: number;
}
```

</details>

<details><summary><code>RobotJointStatePublisherOptions</code></summary>

```ts
interface RobotJointStatePublisherOptions {
  enabled?: boolean;
  joints?: string[];
  topic?: string;
  updateRate?: number;
}
```

</details>

<details><summary><code>RobotWorldOptions</code></summary>

```ts
interface RobotWorldOptions {
  name?: string;
  generateDemoWorld?: boolean;
  spawnPose?: RobotPose6;
  keyboardTeleop?: RobotWorldKeyboardTeleopOptions;
}
```

</details>

<details><summary><code>RobotWorldKeyboardTeleopOptions</code></summary>

```ts
interface RobotWorldKeyboardTeleopOptions {
  enabled?: boolean;
  linearStep?: number;
  angularStep?: number;
}
```

</details>

<details><summary><code>CollectedRobotExport</code></summary>

```ts
interface CollectedRobotExport {
  modelName: string;
  assembly: AssemblyDefinition;
  state: JointState;
  static: boolean;
  selfCollide: boolean;
  allowAutoDisable: boolean;
  links: Record<string, RobotLinkExportOptions>;
  joints: Record<string, RobotJointExportOptions>;
  diffDrive?: RobotDiffDrivePluginOptions;
  jointStatePublisher?: RobotJointStatePublisherOptions;
  world: RobotWorldOptions | null;
}
```

</details>

<details><summary><code>AssemblyDefinition</code></summary>

```ts
interface AssemblyDefinition {
  name: string;
  parts: AssemblyPartDef[];
  joints: AssemblyJointDef[];
  jointCouplings: AssemblyJointCouplingDef[];
}
```

</details>

<details><summary><code>AssemblyPartDef</code></summary>

```ts
interface AssemblyPartDef {
  name: string;
  part: AssemblyPart;
  base: Transform;
  metadata?: PartMetadata;
}
```

</details>

<details><summary><code>PartMetadata</code></summary>

```ts
interface PartMetadata {
  material?: string;
  process?: string;
  tolerance?: string;
  qty?: number;
  notes?: string;
  densityKgM3?: number;
  massKg?: number;
}
```

</details>

<details><summary><code>AssemblyJointDef</code></summary>

```ts
interface AssemblyJointDef {
  name: string;
  type: JointType;
  parent: string;
  child: string;
  frame: Transform;
  axis: Vec3;
  min?: number;
  max?: number;
  defaultValue: number;
  unit?: string;
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}
```

</details>

<details><summary><code>AssemblyJointCouplingDef</code></summary>

```ts
interface AssemblyJointCouplingDef {
  joint: string;
  terms: JointCouplingTermRecord[];
  offset: number;
}
```

</details>

<details><summary><code>JointCouplingTermRecord</code></summary>

```ts
interface JointCouplingTermRecord {
  joint: string;
  ratio: number;
}
```

</details>

#### `dim()`

```ts
dim(from: PointArg$1, to: PointArg$1, opts?: DimOpts): void
```

Add a dimension annotation between two points.

<details><summary><code>DimOpts</code></summary>

```ts
interface DimOpts {
  offset?: number;
  label?: string;
  color?: string;
  component?: string | string[];
  currentComponent?: boolean;
}
```

</details>

#### `dimLine()`

```ts
dimLine(l: Line2D, opts?: DimOpts): void
```

Add a dimension annotation along a Line2D.

### Sketch Export

Export 2D sketches to SVG or DXF format strings.

#### `sketchToDxf()`

```ts
sketchToDxf(sketch: Sketch, options?: SketchDxfOptions): string
```

Export a 2D sketch as a DXF string (R12/AC1009 — maximally compatible). For regular sketches, each polygon loop becomes a closed LWPOLYLINE. For constraint sketches, exports LINE, CIRCLE, and ARC entities from the constraint edge geometry.

<details><summary><code>SketchDxfOptions</code></summary>

```ts
interface SketchDxfOptions {
  /** DXF layer name. Default: "0" */
  layer?: string;
  /** DXF color index (1–255, AutoCAD ACI). Default: 7 (white/black) */
  colorIndex?: number;
}
```

</details>

#### `sketchToSvg()`

```ts
sketchToSvg(sketch: Sketch, options?: SketchSvgOptions): string
```

Export a 2D sketch as an SVG string. For regular sketches, exports filled polygon regions. For constraint sketches, exports line/arc/circle edge geometry. The SVG uses the sketch's native coordinate system (Y-up) with a transform that flips Y so the output renders correctly in SVG's Y-down space. Coordinates are in sketch units (typically mm).

<details><summary><code>SketchSvgOptions</code></summary>

```ts
interface SketchSvgOptions {
  /** Stroke color. Default: "black" */
  stroke?: string;
  /** Stroke width in sketch units. Default: 0.5 */
  strokeWidth?: number;
  /** Fill color. Default: "none" */
  fill?: string;
  /** Padding around the sketch bounding box in sketch units. Default: 2 */
  padding?: number;
  /** If set, scale so 1 sketch-unit = this many px. Otherwise auto-fit. */
  pixelsPerUnit?: number;
}
```

</details>

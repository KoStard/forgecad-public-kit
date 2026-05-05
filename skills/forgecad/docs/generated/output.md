---
skill-group: output
skill-order: 100
---

# Output & Annotations

Dimensions, BOM entries, verification checks, and sketch export.

## Contents

- [Annotations & Output](#annotations-output) — `bom`, `robotExport`, `dim`, `dimLine`
- [Sketch Export](#sketch-export) — `sketchToDxf`, `sketchToSvg`

## Functions

### Annotations & Output

#### `bom()` — Register a Bill of Materials entry for report export.

BOM entries are accumulated during script execution and exported alongside the model in report views. Rows are grouped by normalized `description + unit`. Pass an explicit `key` to force multiple descriptions to collapse into a single line item.

- `quantity` must be a finite number `>= 0`. A quantity of `0` is silently ignored (useful for conditional scripting with `param()`-driven counts).
- `unit` defaults to `"pieces"` when omitted or empty.
- The assembly `solved.bom()` / `solved.bomCsv()` API is separate and covers per-part assembly metadata; this function is for free-form purchased-item annotation.
- `bom()` is injected into every `.forge.js` script. Call it directly; do not write `const { bom } = require(...)`, because top-level declarations named `bom` collide with the built-in runtime name.

```ts
const tubeLen = param("Tube Length", 1200, { min: 300, max: 4000, unit: "mm" });
const boltCount = param("Bolt Count", 16, { min: 0, max: 200, integer: true });

bom(tubeLen, "iron tube 30 x 20", { unit: "mm" });
bom(boltCount, "M4 bolt, 16 mm length");
bom(4, "rubber foot", { key: "foot-rubber" }); // explicit aggregation key

// Structured metadata for richer reports:
bom(tubeLen, "rectangular steel tube", {
  unit: "mm",
  material: "steel",
  section: [30, 20],
  wall: 3,
});
```

```ts
bom(quantity: number, description: string, opts?: BomOpts): void
```

**`BomOpts`**

| Option | Type | Description |
|--------|------|-------------|
| `unit?` | `string` | Quantity unit label, e.g. "mm", "pieces", "kg". Default: "pieces" |
| `key?` | `string` | Optional explicit grouping key used during report aggregation. |
| `material?` | `string` | Material name, e.g. "steel", "birch plywood", "nylon" |
| `dimensions?` | `number[]` | Overall dimensions `[width, height]` or `[width, height, thickness]` in the entry's unit |
| `section?` | `number[]` | Cross-section dimensions `[w, h]` for tubes and profiles |
| `wall?` | `number` | Wall thickness for hollow sections (mm) |
| `diameter?` | `number` | Diameter for round stock, bolts, dowels (mm) |
| `length?` | `number` | Length for fasteners (mm) |
| `process?` | `string` | Manufacturing process, e.g. "laser cut", "CNC", "welded" |
| `notes?` | `string` | Free-form notes |
| `grain?` | `string` | Wood grain direction, e.g. "long", "cross" |

#### `robotExport()` — Declare that this script should export the assembly as a SDF/URDF robot package.

Call `robotExport()` alongside your assembly definition. The CLI commands `forgecad export sdf` and `forgecad export urdf` pick up the declaration and produce a robot package with:

- Mesh-based inertia tensors (full 6-component, not bounding-box approximations)
- Separate collision meshes (convex hull by default — ~50–80% smaller)
- Joint mimic elements derived from `addJointCoupling` / `addGearCoupling`

**Collision mesh modes** (set per-link via `links["PartName"].collision`):

| Mode | Description | Default |
|------|-------------|---------|
| `'convex'` | Convex hull (separate `_collision.stl`) | Yes |
| `'box'` | AABB primitive — fastest physics | |
| `'visual'` | Same mesh as visual — exact but slow | |
| `'none'` | No collision geometry | |

**Unit conventions:**

- Revolute `velocity` is in degrees/second in Forge; exporters convert to rad/s.
- Prismatic distances are in mm in Forge; exported in meters.
- `massKg` is preferred; `densityKgM3` is used when mass is unknown.
- Couplings with multiple terms: only the primary term (largest ratio) maps to `<mimic>` — SDF/URDF support single-leader mimic only. Dropped terms emit a warning.

```ts
const rover = assembly("Scout")
  .addPart("Chassis", box(300, 220, 50).translate(0, 0, -25))
  .addPart("Left Wheel", cylinder(30, 60, undefined, 48).translate(0, 0, -15))
  .addRevolute("leftWheel", "Chassis", "Left Wheel", {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(90, 140, 60),
    effort: 20, velocity: 1080,
  });

robotExport({
  assembly: rover,
  modelName: "Scout",
  links: {
    Chassis: { massKg: 10 },
    "Left Wheel": { massKg: 0.8 },
  },
  plugins: {
    diffDrive: {
      leftJoints: ["leftWheel"], rightJoints: ["rightWheel"],
      wheelSeparationMm: 280, wheelRadiusMm: 60,
    },
  },
  world: { generateDemoWorld: true },
});
```

**CLI usage**

```bash
forgecad export sdf model.forge.js   # SDF package (Gazebo/Ignition)
forgecad export urdf model.forge.js  # URDF package (ROS/PyBullet/MuJoCo)
```

```ts
robotExport(options: RobotExportOptions): CollectedRobotExport
```

**`RobotExportOptions`**: `assembly: Assembly`, `modelName?: string`, `state?: JointState`, `static?: boolean`, `selfCollide?: boolean`, `allowAutoDisable?: boolean`, `links?: Record<string, RobotLinkExportOptions>`, `joints?: Record<string, RobotJointExportOptions>`, `plugins?: { diffDrive?: RobotDiffDrivePluginOptions; jointStatePublisher?: RobotJointStatePublisherOptions; }`, `world?: RobotWorldOptions`

`RobotLinkExportOptions`: `{ massKg?: number, densityKgM3?: number, collision?: "visual" | "convex" | "box" | "none" }`

`RobotJointExportOptions`: `{ effort?: number, velocity?: number, damping?: number, friction?: number }`

**`RobotDiffDrivePluginOptions`**: `leftJoints: string[]`, `rightJoints: string[]`, `wheelSeparationMm: number`, `wheelRadiusMm: number`, `topic?: string`, `odomTopic?: string`, `tfTopic?: string`, `frameId?: string`, `odomFrameId?: string`, `maxLinearVelocity?: number`, `maxAngularVelocity?: number`, `linearAcceleration?: number`, `angularAcceleration?: number`

`RobotJointStatePublisherOptions`: `{ enabled?: boolean, joints?: string[], topic?: string, updateRate?: number }`

`RobotWorldOptions`: `{ name?: string, generateDemoWorld?: boolean, spawnPose?: RobotPose6, keyboardTeleop?: RobotWorldKeyboardTeleopOptions }`

`RobotWorldKeyboardTeleopOptions`: `{ enabled?: boolean, linearStep?: number, angularStep?: number }`

**`CollectedRobotExport`**: `modelName: string`, `assembly: AssemblyDefinition`, `state: JointState`, `static: boolean`, `selfCollide: boolean`, `allowAutoDisable: boolean`, `links: Record<string, RobotLinkExportOptions>`, `joints: Record<string, RobotJointExportOptions>`, `plugins: { diffDrive?: RobotDiffDrivePluginOptions; jointStatePublisher?: RobotJointStatePublisherOptions; }`, `world: RobotWorldOptions | null`

`AssemblyDefinition`: `{ name: string, parts: AssemblyPartDef[], joints: AssemblyJointDef[], jointCouplings: AssemblyJointCouplingDef[] }`

`AssemblyPartDef`: `{ name: string, part: AssemblyPart, base: Transform, metadata?: PartMetadata }`

**`PartMetadata`**: `material?: string`, `process?: string`, `tolerance?: string`, `qty?: number`, `notes?: string`, `densityKgM3?: number`, `massKg?: number`

**`AssemblyJointDef`**: `name: string`, `type: JointType`, `parent: string`, `child: string`, `frame: Transform`, `axis: Vec3`, `min?: number`, `max?: number`, `defaultValue: number`, `unit?: string`, `effort?: number`, `velocity?: number`, `damping?: number`, `friction?: number`, `connectorRefs?: JointConnectorRefs`

`JointConnectorRefs`: `{ parent: string, child: string, parentAlign?: PortAlign, childAlign?: PortAlign }`

`AssemblyJointCouplingDef`: `{ joint: string, terms: JointCouplingTermRecord[], offset: number }`

`JointCouplingTermRecord`: `{ joint: string, ratio: number }`

#### `dim()` — Add a dimension annotation between two points.

Dimension annotations are purely visual callouts rendered in the viewport and report export. They do not affect geometry or constrain the model.

Point arguments accept 2D tuples `[x, y]`, 3D tuples `[x, y, z]`, or [`Point2D`](/docs/sketch#point2d) objects (Z is treated as 0 for 2D inputs).

**Ownership Rules (Report Pages)**

- `currentComponent: true` — deterministic ownership by the calling import instance. Use when authoring reusable imported parts.
- `component: "Part Name"` — route dimension to another named returned object.
- Multiple owners: dimension is shared and appears on the assembly overview page.
- No ownership set: report export infers ownership via endpoint-in-bbox.

```ts
dim([-w / 2, 0, 0], [w / 2, 0, 0], { label: "Width" });
dim([0, 0, -h / 2], [0, 0, h / 2], { label: "Height", offset: 14 });
dim([0, 0, 0], [100, 0, 0], { component: "Base", color: "#00AAFF" });
```

`component` (string or string[] — report ownership), `currentComponent` (boolean)

```ts
dim(from: PointArg, to: PointArg, opts?: DimOpts): void
```

`DimOpts`: `{ offset?: number, label?: string, color?: string, component?: string | string[], currentComponent?: boolean }`

#### `dimLine()` — Add a dimension annotation along a [`Line2D`](/docs/sketch#line2d).

Convenience wrapper around { points from a constrained-sketch [`Line2D`](/docs/sketch#line2d) entity. All `opts` are forwarded unchanged.

```ts
const a = point(0, 0);
const b = point(100, 0);
dimLine(line(a, b), { label: "Span", offset: -8 });
```

```ts
dimLine(l: Line2D, opts?: DimOpts): void
```

### Sketch Export

#### `sketchToDxf()` — Export a 2D sketch as a DXF string (R12/AC1009 — maximally compatible).

For regular sketches, each polygon loop becomes a closed `LWPOLYLINE`. For constrained sketches, exports raw `LINE`, `CIRCLE`, and `ARC` entities from the constraint edge geometry, which preserves internal/shared edges that `toPolygons()` would merge away.

The R12 format is chosen for maximum compatibility with CAM tools, laser-cutter software, and older CAD readers.

```ts
const s = rect(100, 60);
const dxf = sketchToDxf(s, { layer: 'cut' });
```

```ts
sketchToDxf(sketch: Sketch, options?: SketchDxfOptions): string
```

**`SketchDxfOptions`**
- `layer?: string` — DXF layer name. Default: "0"
- `colorIndex?: number` — DXF color index (1–255, AutoCAD ACI). Default: 7 (white/black)

#### `sketchToSvg()` — Export a 2D sketch as an SVG string.

For regular sketches, exports filled polygon regions. For constrained sketches, exports raw edge geometry (LINE, ARC, CIRCLE) which preserves internal/shared edges that `toPolygons()` would merge away.

The SVG uses the sketch's native coordinate system (Y-up) with a CSS transform that flips Y so the output renders correctly in SVG's Y-down space. Coordinates are in sketch units (typically mm).

```ts
const s = rect(100, 60);
const svg = sketchToSvg(s, { stroke: '#333', strokeWidth: 0.8 });
```

```ts
sketchToSvg(sketch: Sketch, options?: SketchSvgOptions): string
```

**`SketchSvgOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `stroke?` | `string` | Stroke color. Default: "black" |
| `strokeWidth?` | `number` | Stroke width in sketch units. Default: 0.5 |
| `fill?` | `string` | Fill color. Default: "none" |
| `padding?` | `number` | Padding around the sketch bounding box in sketch units. Default: 2 |
| `pixelsPerUnit?` | `number` | If set, scale so 1 sketch-unit = this many px. Otherwise auto-fit. |

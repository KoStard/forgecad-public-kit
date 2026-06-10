---
skill-group: output
skill-order: 100
---

# Output & Annotations

Dimensions, BOM entries, verification checks, and sketch export.

## Contents

- [Annotations & Output](#annotations-output)
- [Sketch Export](#sketch-export)

## Functions

### Annotations & Output

#### `bom(quantity: number, description: string, opts?: BomOpts): void` — Register a Bill of Materials entry for report export.

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

#### `robotExport(options: RobotExportOptions): CollectedRobotExport` — Declare that this script should export the assembly as a SDF/URDF robot package.

Call `robotExport()` alongside your assembly definition. `forgecad export sdf` / `forgecad export urdf` pick up the declaration (see the CLI docs for flags) and produce a robot package with:

- Mesh-based inertia tensors (full 6-component, not bounding-box approximations)
- Separate collision meshes (convex hull by default — ~50–80% smaller)
- Joint limits, effort/velocity/damping/friction metadata from assembly joints

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
- Compatibility coupling metadata, when present, maps only the primary term (largest ratio) to `<mimic>` — SDF/URDF support single-leader mimic only. Dropped terms emit a warning.

```ts
robotExport({
  assembly: rover, // assembly() with parts + revolute wheel joints
  modelName: "Scout",
  links: { Chassis: { massKg: 10 }, "Left Wheel": { massKg: 0.8 } },
  plugins: {
    diffDrive: {
      leftJoints: ["leftWheel"], rightJoints: ["rightWheel"],
      wheelSeparationMm: 280, wheelRadiusMm: 60,
    },
  },
  world: { generateDemoWorld: true },
});
```

**`RobotExportOptions`**: `assembly: Assembly`, `modelName?: string`, `state?: JointState`, `static?: boolean`, `selfCollide?: boolean`, `allowAutoDisable?: boolean`, `links?: Record<string, RobotLinkExportOptions>`, `joints?: Record<string, RobotJointExportOptions>`, `plugins?: { diffDrive?: RobotDiffDrivePluginOptions; jointStatePublisher?: RobotJointStatePublisherOptions; }`, `world?: RobotWorldOptions`

`RobotLinkExportOptions`: `{ massKg?: number, densityKgM3?: number, collision?: "visual" | "convex" | "box" | "none" }`

`RobotJointExportOptions`: `{ effort?: number, velocity?: number, damping?: number, friction?: number }`

**`RobotDiffDrivePluginOptions`**: `leftJoints: string[]`, `rightJoints: string[]`, `wheelSeparationMm: number`, `wheelRadiusMm: number`, `topic?: string`, `odomTopic?: string`, `tfTopic?: string`, `frameId?: string`, `odomFrameId?: string`, `maxLinearVelocity?: number`, `maxAngularVelocity?: number`, `linearAcceleration?: number`, `angularAcceleration?: number`

`RobotJointStatePublisherOptions`: `{ enabled?: boolean, joints?: string[], topic?: string, updateRate?: number }`

`RobotWorldOptions`: `{ name?: string, generateDemoWorld?: boolean, spawnPose?: RobotPose6, keyboardTeleop?: RobotWorldKeyboardTeleopOptions }`

`RobotWorldKeyboardTeleopOptions`: `{ enabled?: boolean, linearStep?: number, angularStep?: number }`

**`CollectedRobotExport`**: `modelName: string`, `assembly: AssemblyDefinition`, `state: JointState`, `static: boolean`, `selfCollide: boolean`, `allowAutoDisable: boolean`, `links: Record<string, RobotLinkExportOptions>`, `joints: Record<string, RobotJointExportOptions>`, `plugins: { diffDrive?: RobotDiffDrivePluginOptions; jointStatePublisher?: RobotJointStatePublisherOptions; }`, `world: RobotWorldOptions | null`

**`AssemblyDefinition`**: `name: string`, `parts: AssemblyPartDef[]`, `joints: AssemblyJointDef[]`, `jointCouplings: AssemblyJointCouplingDef[]`, `kinematics: AssemblyKinematicGraphDef`, `frames: AssemblyFrameDef[]`, `frameJoints: AssemblyFrameJointDef[]`, `frameEdges: AssemblyFrameEdgeDef[]`

**`AssemblyPartDef`**: `name: string`, `part: AssemblyPart`, `base: Transform`, `metadata?: PartMetadata`, `mates: AssemblyPartMateInput[]`, `bindToFrame?: string`

`PartMetadata` — defined in [assembly](/docs/assembly).

`AssemblyPartMateInput` — defined in [assembly](/docs/assembly).

**`AssemblyJointDef`**: `name: string`, `type: JointType`, `parent: string`, `child: string`, `frame: Transform`, `axis: Vec3`, `min?: number`, `max?: number`, `defaultValue: number`, `unit?: string`, `effort?: number`, `velocity?: number`, `damping?: number`, `friction?: number`, `connectorRefs?: JointConnectorRefs`

`JointConnectorRefs` — defined in [assembly](/docs/assembly).

`AssemblyJointCouplingDef`: `{ joint: string, terms: JointCouplingTermRecord[], offset: number }`

`JointCouplingTermRecord`: `{ joint: string, ratio: number }`

**`AssemblyKinematicGraphDef`**: `links: AssemblyLinkDef[]`, `edges: AssemblyEdgeBetweenLinksDef[]`, `angles: AssemblyAngleBetweenLinksDef[]`, `derivedLinks: AssemblyDerivedLinkDef[]`

`AssemblyLinkDef`: `{ name: string, at: Vec3, fixed: boolean, metadata?: Record<string, unknown> }`

**`AssemblyEdgeBetweenLinksDef`**: `name: string`, `a: string`, `b: string`, `length: number | null`, `min?: number`, `max?: number`, `visualOnly: boolean`, `control?: AssemblyKinematicControlOptions`, `metadata?: Record<string, unknown>`

`AssemblyKinematicControlOptions` — defined in [assembly](/docs/assembly).

**`AssemblyAngleBetweenLinksDef`**: `name: string`, `a?: string`, `b: string`, `c: string`, `reference?: AssemblyAngleReferenceDef`, `target?: number`, `min?: number`, `max?: number`, `control?: AssemblyKinematicControlOptions`, `metadata?: Record<string, unknown>`

`AssemblyAngleReferenceDef`: `{ kind: "worldDirection", direction: Vec3 }`

**`AssemblyDerivedLinkDef`**
- `distance: number` — Signed: positive moves from `fromLink` toward `towardLink`, negative moves away.
- Also: `name: string`, `fromLink: string`, `towardLink: string`.

`AssemblyFrameDef`: `{ name: string, origin: Vec3, axis: Vec3, up: Vec3, fixed: boolean, metadata?: Record<string, unknown> }`

**`AssemblyFrameJointDef`**: `name: string`, `type: AssemblyFrameJointType`, `parent: string`, `child: string`, `rest: Transform`, `min?: number`, `max?: number`, `defaultValue: number`, `unit?: string`, `control: boolean`, `metadata?: Record<string, unknown>`

`AssemblyFrameEdgeDef`: `{ name: string, a: string, b: string, metadata?: Record<string, unknown> }`

#### `dim()` — Add a dimension annotation between two points, or along an entity.

Overloads:

- `dim(line: Line2D, opts?: DimOpts): void`
- `dim(edge: EdgeRef, opts?: DimOpts): void`
- `dim(from: PointArg, to: PointArg, opts?: DimOpts): void`

Dimension annotations are purely visual callouts rendered in the viewport and report export. They do not affect geometry or constrain the model.

Point arguments accept 2D tuples `[x, y]`, 3D tuples `[x, y, z]`, or [`Point2D`](/docs/sketch#point2d) objects (Z is treated as 0 for 2D inputs).

Entity arguments: pass a single [`Line2D`](/docs/sketch#line2d) (from a constrained sketch) or an `EdgeRef` (from `shape.edge('left')`) as the first argument to dimension along that entity directly — no manual endpoint extraction needed.

**Ownership Rules (Report Pages)**

- `currentComponent: true` — deterministic ownership by the calling import instance. Use when authoring reusable imported parts.
- `component: "Part Name"` — route dimension to another named returned object.
- Multiple owners: dimension is shared and appears on the assembly overview page.
- No ownership set: report export infers ownership via endpoint-in-bbox.

```ts
dim([-w / 2, 0, 0], [w / 2, 0, 0], { label: "Width" });
dim([0, 0, -h / 2], [0, 0, h / 2], { label: "Height", offset: 14 });
dim([0, 0, 0], [100, 0, 0], { component: "Base", color: "#00AAFF" });
dim(sk.line(a, b), { label: "Span", offset: -8 });   // Line2D entity
dim(myBox.edge("top-right"), { label: "Depth" });    // EdgeRef entity
```

[`Line2D`](/docs/sketch#line2d) / `EdgeRef` entity (then pass `opts` as the second argument)

`component` (string or string[] — report ownership), `currentComponent` (boolean)

`DimOpts`: `{ offset?: number, label?: string, color?: string, component?: string | string[], currentComponent?: boolean }`

**`EdgeRef`**

| Option | Type | Description |
|--------|------|-------------|
| `start` | `Vec3` | Start point |
| `end` | `Vec3` | End point |
| `query?` | `EdgeQueryRef` | Compiler-owned edge query when available. |
| `curve?` | `EdgeCurve` | Exact or parametric curve family when the backend/source can identify one. |
| `faceName?` | `string` | Owning face name when the edge is associated with one face in a larger topology. |

Also: `name: EdgeName`.

### Sketch Export

#### `sketchToDxf(sketch: Sketch, options?: SketchDxfOptions): string` — Export a 2D sketch as a DXF string (R12/AC1009 — maximally compatible).

For regular sketches, each polygon loop becomes a closed `LWPOLYLINE`. For constrained sketches, exports raw `LINE`, `CIRCLE`, and `ARC` entities from the constraint edge geometry, which preserves internal/shared edges that `toPolygons()` would merge away.

The R12 format is chosen for maximum compatibility with CAM tools, laser-cutter software, and older CAD readers.

```ts
const s = rect(100, 60);
const dxf = sketchToDxf(s, { layer: 'cut' });
```

**`SketchDxfOptions`**
- `layer?: string` — DXF layer name. Default: "0"
- `colorIndex?: number` — DXF color index (1–255, AutoCAD ACI). Default: 7 (white/black)

#### `sketchToSvg(sketch: Sketch, options?: SketchSvgOptions): string` — Export a 2D sketch as an SVG string.

For regular sketches, exports filled polygon regions. For constrained sketches, exports raw edge geometry (LINE, ARC, CIRCLE) which preserves internal/shared edges that `toPolygons()` would merge away.

The SVG uses the sketch's native coordinate system (Y-up) with a CSS transform that flips Y so the output renders correctly in SVG's Y-down space. Coordinates are in sketch units (typically mm).

```ts
const s = rect(100, 60);
const svg = sketchToSvg(s, { stroke: '#333', strokeWidth: 0.8 });
```

**`SketchSvgOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `stroke?` | `string` | Stroke color. Default: "black" |
| `strokeWidth?` | `number` | Stroke width in sketch units. Default: 0.5 |
| `fill?` | `string` | Fill color. Default: "none" |
| `padding?` | `number` | Padding around the sketch bounding box in sketch units. Default: 2 |
| `pixelsPerUnit?` | `number` | If set, scale so 1 sketch-unit = this many px. Otherwise auto-fit. |

---
skill-group: assembly
skill-order: 100
---

# Assembly API

Kinematic assemblies, joints, couplings, and robot export.

## Contents

- [Assembly & Joints](#assembly-joints) — `bomToCsv`, `assembly`, `joint`
- [Assembly](#assembly) — Structure, Connectors, References, Joints, Solving
- [ImportedAssembly](#importedassembly)
- [SolvedAssembly](#solvedassembly)
- [MateBuilder](#matebuilder)

## Functions

### Assembly & Joints

#### `bomToCsv()` — Convert an array of BOM rows into a CSV string.

Produces a CSV with columns: `part`, `qty`, `material`, `process`, `tolerance`, `notes`. String values are quoted and internal double-quotes are escaped. Prefer calling `solvedAssembly.bomCsv()` directly — this function is exposed for custom BOM processing.

```ts
bomToCsv(rows: BomRow[]): string
```

**`BomRow`**: `part: string`, `qty: number`, `material?: string`, `process?: string`, `tolerance?: string`, `notes?: string`, `metadata?: PartMetadata`

**`PartMetadata`**

| Option | Type | Description |
|--------|------|-------------|
| `tags?` | `string \| readonly string[]` | Viewport organization tags applied to scene objects produced from this part. |
| `material?`, `process?`, `tolerance?`, `qty?`, `notes?`, `densityKgM3?`, `massKg?` | | — |

#### `assembly()` — Create an assembly container with named parts and joints for kinematic mechanisms.

**Use this from iteration 1 for any model with moving parts.** Hinges, sliders, gears, articulated fingers, doors — all start with `assembly()`, not with manual rotation math. Don't build a static "extended pose" first and refactor to an assembly later: joint sliders, animations, sweeps, collision detection, and robot export all flow from the kinematic graph.

An assembly models a mechanism as a directed graph of parts connected by joints. Parts are the nodes; joints are directed edges from parent to child. The graph must be a forest (no cycles). Root parts (those with no incoming joint) are anchored to world space.

Three joint types are supported: `'revolute'` (hinge), `'prismatic'` (slider), and `'fixed'` (rigid attachment). Use `addPart()` to add geometry, `addJoint()` (or the shorthands `addRevolute()`, `addPrismatic()`, `addFixed()`) to connect parts, and `solve()` to compute world-space positions at a given joint state.

The higher-level `connect()` API uses declared **connectors** to compute joint frames automatically. The `match()` API uses typed connectors (with gender and type metadata) for automatic compatibility validation and joint creation.

For multi-file assemblies, a file that returns an `Assembly` is importable via [`require()`](/docs/core#require) and yields an `ImportedAssembly`. Use `mergeInto()` to flatten a sub-assembly into a parent assembly.

```ts
const mech = assembly("Arm")
  .addPart("base", box(80, 80, 20).translate(0, 0, -10), {
    metadata: { material: "PETG", process: "FDM", qty: 1 },
  })
  .addPart("link", box(140, 24, 24).translate(0, -12, -12))
  .addRevolute("shoulder", "base", "link", {
    axis: [0, 1, 0],
    min: -30, max: 120, default: 25,
    frame: Transform.identity().translate(0, 0, 20),
  });

return mech; // auto-solved at defaults, renders all parts
```

```ts
assembly(name?: string): Assembly
```

#### `joint()` — Create a revolute joint that auto-generates a parameter slider and rotates the shape.

This is a convenience wrapper for single-shape, single-joint use cases. It calls `param()` to create a named angle slider, then applies `rotateAroundAxis()` to the shape. Use the full `Assembly` API for mechanisms with multiple parts and joints.

```ts
const arm = joint("Shoulder", armShape, [0, 0, 20], {
  axis: [0, 1, 0],
  min: -30, max: 120, default: 25,
});
return arm;
```

```ts
joint(name: string, shape: Shape, pivot: [ number, number, number ], opts?: RevoluteJointOpts): Shape
```

`RevoluteJointOpts`: `{ axis?: [ number, number, number ], min?: number, max?: number, default?: number, unit?: string, reverse?: boolean }`

---

## Classes

### `Assembly`

Container for a kinematic mechanism made up of named parts and joints.

An assembly is a directed graph where **parts** are nodes and **joints** are directed edges from parent to child. The graph must be a forest (one or more trees with no cycles). Root parts (no incoming joint) are fixed to world space.

Each joint carries a `frame` transform (from the parent part frame to the joint's zero-state frame) and a motion formula:

```
childWorld = parentWorld × frame × motion(value) × childBase
```

Three joint types are supported:

- **revolute** — rotates the child around an axis by `value` degrees
- **prismatic** — translates the child along an axis by `value` mm
- **fixed** — no motion; rigidly attaches the child at `frame`

**Quick start**

```ts
const mech = assembly("Arm")
  .addPart("base", box(80, 80, 20).translate(0, 0, -10))
  .addPart("link", box(140, 24, 24).translate(0, -12, -12))
  .addJoint("shoulder", "revolute", "base", "link", {
    axis: [0, 1, 0],
    min: -30, max: 120, default: 25,
    frame: Transform.identity().translate(0, 0, 20),
  });

return mech; // auto-solved at defaults
```

Returning an unsolved `Assembly` auto-solves at default joint values. Return a `SolvedAssembly` directly for a specific pose:

```ts
return mech.solve({ shoulder: 60 });
```

**Return types**

| Return value | Standalone | `require()` result type |
|---|---|---|
| `Assembly` (unsolved) | yes | `ImportedAssembly` |
| `SolvedAssembly` | yes | `SolvedAssembly` |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Connectors**

#### `usedConnectorRefs()` — Connector refs (e.g. "PartName.connectorName") consumed by connect/match calls.

```ts
get usedConnectorRefs(): ReadonlySet<string>
```

#### `withConnectors()` — Attach named connectors to a specific part or the assembly as a whole.

Connectors declared this way are in the part's local coordinate system. They are captured automatically if the incoming [`Shape`](/docs/core#shape) already has connectors via `shape.withConnectors(...)`, but you can also add or override connectors after the fact with this method.

Use the single-argument overload to attach assembly-level connectors — these are exposed when this assembly is imported as a sub-assembly.

```ts
withConnectors(partName: string, connectors: Record<string, ConnectorInput>): Assembly
```

#### `getConnectors()` — Get connectors declared on a part in part-local space.

```ts
getConnectors(partName: string): ConnectorMap
```

#### `getConnector()` — Parse a "PartName.connectorName" reference and return the resolved connector. Throws descriptive errors if the part or connector doesn't exist.

```ts
getConnector(ref: string): { partName: string; connectorName: string; connector: ConnectorDef; }
```

#### `connect()` — Connect two parts by aligning their declared connectors, automatically computing frame and axis.

Connector references use `"PartName.connectorName"` format. The system aligns connector origins (child connector lands exactly on parent connector) and derives the joint frame and axis from the connector geometry — no manual `frame` or `axis` math needed.

**Face-to-face convention:** Connectors always meet face-to-face, like a USB plug meeting a socket. Each connector's axis points "outward" from its part. When two connectors mate, the system brings them together so their axes oppose (anti-parallel). This is the same convention used by `matchTo()`.

For a revolute joint (hinge), both connectors' axes should point outward from their respective parts along the hinge line. For a prismatic joint (slider), both axes should point along the slide direction from their part's perspective.

The joint type is inferred from the connector's `kind` field if not specified in `options`.

When connectors are defined with `start`/`end`, you can control which point on each connector meets via `align` / `parentAlign` / `childAlign` (`'start'`, `'middle'`, `'end'`).

Use `connect()` when connector origins must physically coincide (flange-to-flange, bolt-into-bore). For mechanisms where parts share an axis but are deliberately spaced apart, use `addRevolute()` with pre-positioned parts instead.

```ts
// Hinge: both axes point outward along the hinge line
const frame = box(100, 10, 80).withConnectors({
  hinge: connector("hinge", { origin: [0, 0, 40], axis: [0, 0, 1] }),
});
const door = box(60, 4, 80).withConnectors({
  hinge: connector("hinge", { origin: [0, 0, 40], axis: [0, 0, -1] }),
});
assembly("Door")
  .addPart("Frame", frame)
  .addPart("Door", door)
  .connect("Frame.hinge", "Door.hinge", { as: "swing", min: 0, max: 110 });
```

```ts
connect(parentConnectorRef: string, childConnectorRef: string, options?: ConnectOptions): Assembly
```

#### `match()` — Auto-create a joint by matching typed connectors between two parts.

Connectors can carry a `connectorType` string and a `gender` (`'male'`, `'female'`, or `'neutral'`). `match()` validates type and gender compatibility (use `{ force: true }` to skip validation) and creates the joint automatically from the connector's `kind` metadata.

The `pairs` map is `{ childConnector: parentConnector }`. The first pair drives joint creation; additional pairs are validated but do not create additional joints (they constrain the same rigid connection).

Define connectors on shapes with `shape.withConnectors(...)`:

```ts
const door = doorShape.withConnectors({
  hinge_top: connector.male("hinge", { origin: [0, 0, 90], axis: [0, 0, 1] }),
  hinge_bottom: connector.male("hinge", { origin: [0, 0, 10], axis: [0, 0, 1] }),
});
```

Then match in the assembly:

```ts
const mech = assembly("Door")
  .addPart("Frame", frame)
  .addPart("Door", door)
  .match("Door", "Frame", { hinge_top: "hinge_top", hinge_bottom: "hinge_bottom" });
// Revolute connectors → auto-creates revolute joint. No manual addRevolute needed.
```

```ts
match(childPartName: string, parentPartName: string, pairs: Record<string, string>, options?: MatchToOptions & { as?: string; }): Assembly
```

**References**

#### `withReferences()` — Attach named placement reference points to this assembly. These are surfaced automatically on the ImportedAssembly when this file is imported via require(), so consumers can use placeReference() without re-declaring them. Returns a new Assembly — does not mutate.

```ts
withReferences(refs: Pick<PlacementReferenceInput, "points">): Assembly
```

**Solving**

#### `solve()` — Solve the assembly at the given joint state and return positioned parts.

Performs a depth-first traversal of the joint graph. Each joint's value is taken from `state`, falling back to `defaultValue`. Coupled joints compute their value from source joints. Values outside `[min, max]` are clamped (a warning is added to `SolvedAssembly.warnings()`).

If mate constraints were registered via `mate()`, the solver runs a pre-pass to derive base transforms, then the kinematic DFS applies joints on top of those positions.

**Pitfall — [`jointsView`](/docs/viewport#jointsview) double-rotation:** When calling `toJointsView()`, always solve at the rest pose (all joint values = 0 or default). Solving at a non-zero angle and then animating will double-rotate parts. Use the `defaults` option on `toJointsView()` to set the initial display angle instead.

This pitfall only applies when `toJointsView()` is active. If you only want a static posed result, return the solved assembly directly and skip `toJointsView()`.

**Example — static posed output (no `toJointsView()`)**

```ts
return mech.solve({ shoulder: 45, elbow: -20 });
```

```ts
solve(state?: JointState): SolvedAssembly
```

**Other**

#### `mate()` — Register mate constraints between parts. Constraints are solved during `solve()` to derive part positions and explode hints. Part references use "partName:featureName" format.

```ts
mate(fn: (m: MateBuilder) => void): Assembly
```

#### `addFrame()` — Add a virtual reference frame (no geometry) to the assembly graph.

Useful when you need a named pivot point or coordinate frame that has no visual geometry. Acts like a zero-volume part and can be connected to other parts via joints.

```ts
addFrame(name: string, options?: PartOptions): Assembly
```

#### `addPart()` — Add a named part to the assembly.

Connectors declared on the part (via `withConnectors()`) are captured automatically. Parts are positioned at world origin by default unless a `transform` is provided in `options`. For root parts (no incoming joint), `transform` is their final world position.

When a part is a [`ShapeGroup`](/docs/core#shapegroup), name the group children explicitly to get readable viewport labels (e.g. `"Base Assembly.Body"` instead of `"Base Assembly.1"`):

```ts
const housing = group(
  { name: "Body", shape: body },
  { name: "Lid", shape: lid },
);
assembly.addPart("Base Assembly", housing);
```

```ts
addPart(name: string, part: AssemblyPart, options?: PartOptions): Assembly
```

#### `addJoint()` — Add a kinematic joint between a parent and child part.

`frame` is a transform from the **parent part frame** to the **joint frame at zero state**. The child's world position is computed as:

```
childWorld = parentWorld × frame × motion(value) × childBase
```

For revolute joints `value` is in degrees; for prismatic joints `value` is in mm. Coupled joints (see `addJointCoupling`) ignore the `state` value passed to `solve()` and compute their value from source joints.

```ts
addJoint(name: string, type: JointType, parent: string, child: string, options?: JointOptions): Assembly
```

#### `addRevolute()` — Shorthand for `addJoint(name, 'revolute', parent, child, options)`.

```ts
addRevolute(name: string, parent: string, child: string, options?: JointOptions): Assembly
```

#### `addPrismatic()` — Shorthand for `addJoint(name, 'prismatic', parent, child, options)`.

```ts
addPrismatic(name: string, parent: string, child: string, options?: JointOptions): Assembly
```

#### `addFixed()` — Shorthand for `addJoint(name, 'fixed', parent, child, options)`.

Fixed joints rigidly attach a child part to its parent at `frame` with no motion. Before calling `mergeInto()`, use `addFixed()` to collapse multiple root parts into a single root.

```ts
addFixed(name: string, parent: string, child: string, options?: JointOptions): Assembly
```

#### `addJointCoupling()` — Link a joint's value to a linear combination of other joint values.

The driven joint's value is computed as:

```
driven = offset + Σ(ratio_i × source_i)
```

Coupled joints ignore any value passed in `solve(state)` — a warning is emitted if you try to override one. Coupling cycles are rejected. You cannot sweep a coupled joint directly; sweep one of its source joints instead.

```ts
assembly
  .addRevolute("Steering", "Base", "Turret", { axis: [0, 0, 1] })
  .addRevolute("WheelDrive", "Turret", "Wheel", { axis: [1, 0, 0] })
  .addRevolute("TopGear", "Base", "TopInput", { axis: [0, 0, 1] })
  .addJointCoupling("TopGear", {
    terms: [
      { joint: "Steering", ratio: 1 },
      { joint: "WheelDrive", ratio: 20 / 14 },
    ],
  });
```

```ts
addJointCoupling(jointName: string, options: JointCouplingOptions): Assembly
```

#### `addGearCoupling()` — Link two revolute joints via a gear ratio.

Choose exactly one ratio source:

- `ratio` — explicit numeric ratio (driven/driver, negative for external mesh)
- `pair` — a `GearRatioLike` from `lib.gearPair`, `lib.bevelGearPair`, etc. (uses `pair.jointRatio`)
- `driverTeeth` + `drivenTeeth` — auto-computes ratio; use `mesh` to control sign (`'external'` = negative/opposite rotation, `'internal'` = positive, `'bevel'`/`'face'` = negative)

When `pair` carries a `phaseDeg`, it is auto-applied as the coupling `offset` to align teeth correctly. Override with `offset: 0` if gear shapes already have the phase baked in.

```ts
const pair = lib.gearPair({ pinion: { module: 1.25, teeth: 14 }, gear: { module: 1.25, teeth: 42 } });
assembly
  .addRevolute("Pinion", "Base", "PinionPart", { axis: [0, 0, 1] })
  .addRevolute("Driven", "Base", "GearPart", { axis: [0, 0, 1] })
  .addGearCoupling("Driven", "Pinion", { pair });
```

```ts
addGearCoupling(drivenJointName: string, driverJointName: string, options?: GearCouplingOptions): Assembly
```

#### `sweepJoint()` — Sample a joint through its motion range, collecting collision data at each step.

Divides `[from, to]` into `steps` intervals (producing `steps + 1` frames). At each sample, the assembly is solved with the sweeping joint at that value and `baseState` for all others. Returns one `JointSweepFrame` per sample with the joint value, collision findings, and any solve warnings.

You cannot sweep a coupled joint — sweep one of its source joints instead.

```ts
const sweep = mech.sweepJoint("elbow", -10, 135, 12, { shoulder: 35 });
const hits = sweep.filter(frame => frame.collisions.length > 0);
console.log(`Collisions at ${hits.length} of ${sweep.length} poses`);
```

```ts
sweepJoint(jointName: string, from: number, to: number, steps: number, baseState?: JointState, collisionOptions?: CollisionOptions): JointSweepFrame[]
```

#### `toJointsView()` — Derive viewport joint controls from the assembly graph and register them.

Solves the assembly at rest (all joints = default), then converts each joint into a `JointViewInput` with world-space pivot and axis. Fixed joints become hidden zero-range revolute entries so attached parts follow their parent during animation. Joint couplings are forwarded to the viewport automatically.

This method is optional. Call it only when you want viewport joint sliders, coupled controls, or playback animations. If you only want geometry, return the `Assembly` or `SolvedAssembly` directly and skip `toJointsView()`.

**Critical pitfall:** Always call `toJointsView()` before solving for display. Then solve at the **rest pose** (no state overrides) and return that solved assembly result directly. Do not flatten it with `.toGroup()` if you want the viewport joint animation to keep working.

Do not solve at a non-zero angle when using `toJointsView()` — the viewport will apply the same rotation again, double-rotating the part.

```ts
mech.toJointsView({
  defaults: { J1: 30 },
  animations: [{
    name: "Swing", duration: 2, loop: true,
    keyframes: [{ values: { J1: -45 } }, { values: { J1: 45 } }, { values: { J1: -45 } }],
  }],
});

// Solve at REST — viewport handles posing
return mech.solve();
```

```ts
toJointsView(options?: ToJointsViewOptions): void
```

#### `describe()` — Return the serializable assembly definition used by solve/inspect pipelines.

```ts
describe(): AssemblyDefinition
```

**Legacy Aliases**

- `usedPortRefs` -> `usedConnectorRefs`
- `withPorts()` -> `withConnectors()`
- `getPorts()` -> `getConnectors()`
- `getPort()` -> `getConnector()`

### `ImportedAssembly`

A wrapper around an imported `Assembly` that provides kinematic access and convenient transform helpers.

When a `.forge.js` file returns an unsolved `Assembly`, [`require()`](/docs/core#require) wraps it in an `ImportedAssembly`. This preserves the kinematic structure — you can call `solve()`, `sweepJoint()`, and `mergeInto()` — while also allowing convenience transforms that auto-solve at default values.

**Kinematic access**

```ts
const arm = require("./arm.forge.js");

const solved = arm.solve({ shoulder: 45 });   // full kinematic solve
const link   = arm.part("Link", { shoulder: 60 }); // single part at state
const group  = arm.toGroup({ shoulder: 45 });  // only when ShapeGroup behavior is needed
```

**Convenience transforms** (auto-solve at defaults, return [`ShapeGroup`](/docs/core#shapegroup)):

```ts
const positioned = arm.rotateZ(-90).translate(0, -20, 50);
```

**Merging into a parent**

```ts
require("./arm.forge.js").mergeInto(robot, {
  prefix: "Left Arm",
  mountParent: "Chassis",
  mountJoint: "leftMount",
  mountOptions: { frame: Transform.identity().translate(-70, 0, 10) },
});
```

#### `assembly()` — The underlying Assembly — use for sweepJoint, addPart into parent, etc.

```ts
get assembly(): Assembly
```

#### `solve()` — Solve the assembly at the given joint state (defaults to each joint's default value).

```ts
solve(state?: JointState): SolvedAssembly
```

#### `part()` — Return a specific named part positioned at the given joint state, with any stored placement offset applied.

```ts
part(name: string, state?: JointState): AssemblyPart
```

#### `toGroup()` — Convert all assembly parts to a ShapeGroup with named children. Use this for composition, transforms, or child lookup — not as a required render step for assemblies. Child names match the part names used in the assembly. Any stored placement offset and placement references are forwarded to the group.

```ts
toGroup(state?: JointState): ShapeGroup
```

#### `withReferences()` — Attach named placement reference points to this assembly. Points are simple 3D coordinates (relative to the assembly's own origin). Returns a new ImportedAssembly — does not mutate.

```ts
withReferences(refs: Pick<PlacementReferenceInput, "points">): ImportedAssembly
```

#### `referenceNames()` — List all attached placement reference names.

```ts
referenceNames(kind?: PlacementReferenceKind): string[]
```

#### `placeReference()` — Translate the assembly so the named reference point lands on `target`. Returns a new ImportedAssembly — does not mutate. All point refs are translated by the same delta.

```ts
placeReference(ref: string, target: [ number, number, number ], offset?: [ number, number, number ]): ImportedAssembly
```

#### `translate()` — Solve at defaults and return a translated ShapeGroup.

```ts
translate(x: number, y: number, z: number): ShapeGroup
```

#### `rotate()` — Solve at defaults and return a rotated ShapeGroup.

```ts
rotate(axis: [ number, number, number ], angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateX()` — Solve at defaults and return a ShapeGroup rotated around X.

```ts
rotateX(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateY()` — Solve at defaults and return a ShapeGroup rotated around Y.

```ts
rotateY(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `rotateZ()` — Solve at defaults and return a ShapeGroup rotated around Z.

```ts
rotateZ(angleDeg: number, options?: { pivot?: [ number, number, number ]; }): ShapeGroup
```

#### `scale()` — Solve at defaults and return a scaled ShapeGroup.

```ts
scale(v: number | [ number, number, number ]): ShapeGroup
```

#### `mirror()` — Solve at defaults and return a mirrored ShapeGroup.

```ts
mirror(normal: [ number, number, number ]): ShapeGroup
```

#### `color()` — Solve at defaults and return a colored ShapeGroup.

```ts
color(hex: string): ShapeGroup
```

#### `child()` — Solve at defaults, get a named child part from the resulting group.

```ts
child(name: string): Shape | Sketch | ShapeGroup
```

#### `mergeInto()` — Flatten this sub-assembly's parts and joints into `parent` and wire a mount joint.

All part and joint names from the sub-assembly are prefixed with `"${options.prefix}."` to avoid collisions. After the merge, sub-assembly joints are driven from the parent using the prefixed names:

```ts
parent.solve({ "Left Arm.shoulder": 45, "Right Arm.shoulder": -20 })
```

Joint couplings inside the sub-assembly are preserved and rewritten with the prefix. Ports from sub-assembly parts are forwarded with the prefix.

The sub-assembly must have exactly one root part. If it has multiple roots, use `addFixed()` first to consolidate them before merging.

```ts
const robot = assembly("Robot").addPart("Chassis", chassis);

require("./arm.forge.js").mergeInto(robot, {
  prefix: "Left Arm",
  mountParent: "Chassis",
  mountJoint: "leftMount",
  mountOptions: { frame: Transform.identity().translate(-70, 0, 10) },
});
```

```ts
mergeInto(parent: Assembly, options: MergeIntoOptions): Assembly
```

### `SolvedAssembly`

The result of solving an assembly at a specific joint state.

`SolvedAssembly` holds world-space transforms for every part at a given pose. Top-level scripts can return a `SolvedAssembly` directly for display. Use `toGroup()` when you specifically need a [`ShapeGroup`](/docs/core#shapegroup) for composition, group-style transforms, or named-child lookup. Do not call `toGroup()` just to make a solved assembly render. Use `getPart()` / `getTransform()` to inspect individual parts programmatically.

**Validation**

Call `collisionReport()` to detect overlapping parts, or `sweepJoint()` on the parent `Assembly` to check for interference across the joint's motion range.

```ts
const solved = mech.solve({ shoulder: 45, elbow: -20 });
console.log("Collisions", solved.collisionReport());
return solved;
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

#### `warnings()` — Return any warnings generated during solve (clamped joints, unconverged mates, etc.).

```ts
warnings(): string[]
```

#### `getJointState()` — Return a snapshot of resolved joint values (after clamping and coupling).

```ts
getJointState(): JointState
```

#### `mateExplodeHints()` — Explode direction hints derived from mate constraints, or null if no mates.

```ts
get mateExplodeHints(): Record<string, { direction: Vec3; }> | null
```

#### `mateDof()` — Remaining degrees of freedom after mate constraints, or null if no mates.

```ts
get mateDof(): number | null
```

#### `mateConverged()` — Whether the mate constraint solver converged, or null if no mates.

```ts
get mateConverged(): boolean | null
```

#### `getTransform()` — Return the world-space [`Transform`](/docs/core#transform) for the named part at the solved pose.

```ts
getTransform(partName: string): Transform
```

#### `getPart()` — Return the named part already positioned at its solved world transform.

```ts
getPart(partName: string): AssemblyPart
```

#### `toGroup()` — Convert all solved parts into a [`ShapeGroup`](/docs/core#shapegroup) with named children.

Each part becomes a named child in the group, already positioned at its solved world transform. Use this only when you specifically need a [`ShapeGroup`](/docs/core#shapegroup) for composition, [`ShapeGroup`](/docs/core#shapegroup) transforms, or named-child access. Top-level scripts can return the `SolvedAssembly` directly; do not call `toGroup()` just to make a solved assembly render.

```ts
const armGroup = mech.solve({ shoulder: 60 }).toGroup(); // only because we need rotateZ()
return armGroup.rotateZ(90);
```

```ts
toGroup(): ShapeGroup
```

#### `toSceneObjects()` — Return an array of named scene objects for the viewport renderer.

Each part becomes `{ name, shape }` or `{ name, group: [...] }` if the part is a [`ShapeGroup`](/docs/core#shapegroup). Top-level scripts should normally return the `SolvedAssembly` directly. Use `toGroup()` when you need [`ShapeGroup`](/docs/core#shapegroup) behavior; use this method only for advanced scene-graph control where you need access to the flat per-part array with metadata.

```ts
toSceneObjects(): Array<{ name: string; shape?: Shape; group?: Array<{ name: string; shape: Shape; tags?: string[]; }>; metadata?: PartMetadata; }>
```

#### `toScene()` — Backward-compatible alias for `toSceneObjects()`.

```ts
toScene(): Array<{ name: string; shape?: Shape; group?: Array<{ name: string; shape: Shape; tags?: string[]; }>; metadata?: PartMetadata; }>
```

#### [`bom()`](/docs/output#bom) — Generate a bill of materials for all parts in the solved assembly.

```ts
bom(): BomRow[]
```

#### `bomCsv()` — Generate a bill of materials as a CSV string.

```ts
bomCsv(): string
```

#### `collisionReport()` — Detect overlapping (colliding) part pairs in this solved pose.

Computes boolean intersections between all part pairs and returns findings where the overlap volume exceeds `minOverlapVolume` (default 0.1 mm³).

```ts
const solved = mech.solve({ shoulder: 35, elbow: 60 });
console.log("Collisions", solved.collisionReport());
```

```ts
collisionReport(options?: CollisionOptions): CollisionFinding[]
```

#### `minClearance()` — Compute the minimum gap (clearance) between two parts in this solved pose.

Returns `0` if the parts are touching or overlapping. Requires the Manifold backend. `searchLength` bounds the search radius in mm — increase it for widely separated parts.

```ts
minClearance(partA: string, partB: string, searchLength?: number): number
```

### `MateBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `constraints` | `Constraint3D[]` | — |

**Methods:**

#### `flush()` — Constrain two faces so they stay flush.

```ts
flush(faceA: string, faceB: string): string
```

#### `align()` — Constrain two faces so their normals align.

```ts
align(faceA: string, faceB: string): string
```

#### `parallel()` — Constrain two faces so they remain parallel.

```ts
parallel(faceA: string, faceB: string): string
```

#### `faceDistance()` — Constrain the distance between two faces.

```ts
faceDistance(faceA: string, faceB: string, distance: number): string
```

#### `concentric()` — Constrain two axes to share the same center line.

```ts
concentric(axisA: string, axisB: string): string
```

#### `axisParallel()` — Constrain two axes to remain parallel.

```ts
axisParallel(axisA: string, axisB: string): string
```

#### `pointCoincident()` — Constrain two points to coincide.

```ts
pointCoincident(pointA: string, pointB: string): string
```

#### `pointOnFace()` — Constrain a point to lie on a face.

```ts
pointOnFace(point: string, face: string): string
```

#### `pointOnAxis()` — Constrain a point to lie on an axis.

```ts
pointOnAxis(point: string, axis: string): string
```

#### `angle()` — Constrain the angle between two faces.

```ts
angle(faceA: string, faceB: string, degrees: number): string
```

#### `totalEquations()` — Total constraint equations.

```ts
get totalEquations(): number
```

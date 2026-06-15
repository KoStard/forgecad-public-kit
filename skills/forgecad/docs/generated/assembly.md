---
skill-group: assembly
skill-order: 100
---

# Assembly API

Assembly-owned links, constraints, connectors, solved poses, and source-level simulation metadata.

## Contents

- [Assembly & Joints](#assembly-joints)
- [Assembly](#assembly) — Kinematics, Structure, Connectors, References, Solving
- [ImportedAssembly](#importedassembly)
- [SolvedAssembly](#solvedassembly)

## Functions

### Assembly & Joints

#### `Sim.material(name: string, options?: SimMaterialOptions): SimMaterialDef` — Create a named physical material with density and contact coefficients for simulation export and checks.

`SimMaterialOptions`: `{ densityKgM3?: number, staticFriction?: number, dynamicFriction?: number, restitution?: number }`

`SimMaterialDef`: `{ kind: "material", name: string }`

#### `Sim.body(options: SimBodyOptions): SimBodyDef` — Describe one assembly part as a physical body with mass/density, material, collider intent, and optional contact surfaces.

**`SimBodyOptions`**: `massKg?: number`, `densityKgM3?: number`, `material?: SimMaterialDef`, `collider?: SimColliderDef`, `contacts?: Record<string, SimContactDef>`

`SimColliderDef`: `{ kind: "collider", mode: SimColliderMode, reason?: string }`

`SimContactDef`: `{ kind: "wheelSurface" | "gripperSurface", connectorName: string }`

`SimBodyDef`: `{ kind: "body" }`

#### `Sim.collider` — Collision-geometry intent constructors for physical parts.

- `Sim.collider.convexHull(): SimColliderDef` — Use a generated collision mesh for the part. This is the default fast rigid-body collider for irregular parts.
- `Sim.collider.boundingBox(): SimColliderDef` — Use the part bounding box as the collision geometry. This is fastest and works well for chassis and simple blocks.
- `Sim.collider.visualMesh(): SimColliderDef` — Use the visual mesh as collision geometry. This is exact but usually slower in physics engines.
- `Sim.collider.none(reason: string): SimColliderDef` — Disable collision for a part with an explicit reason, such as a sensor-only or decorative object.

#### `Sim.drive` — Joint-drive intent constructors for passive or powered assembly joints.

- `Sim.drive.passive(options?: SimPassiveDriveOptions): SimDriveDef` — Mark a joint as passive while preserving damping and friction metadata for simulation export.
- `Sim.drive.velocity(options: SimVelocityDriveOptions): SimDriveDef` — Mark a revolute joint as velocity-driven with torque and speed limits. Speed is authored in rpm and exported as deg/s or rad/s as needed.

`SimPassiveDriveOptions`: `{ damping?: number, friction?: number }`

`SimVelocityDriveOptions`: `{ maxTorqueNm: number, maxSpeedRpm: number }`

#### `Sim.contact` — Contact-surface metadata over existing part connectors.

- `Sim.contact.wheelSurface(connectorName: string): SimContactDef` — Mark a connector as the wheel tread contact surface for offline checks and downstream simulation metadata.
- `Sim.contact.gripperSurface(connectorName: string): SimContactDef` — Mark a connector as a gripper pad/contact surface for offline checks and downstream grasp-readiness metadata.

#### `Sim.profile` — Named validation/export profile constructors.

- `Sim.profile.robotBodyRunnable(): SimProfileDef` — SimReady-style profile for a robot body that should be runnable in a physics simulator.
- `Sim.profile.robotBodyIsaac(): SimProfileDef` — SimReady-style profile for robot bodies targeting Isaac Sim readiness.
- `Sim.profile.roboticsAssetPhysx(): SimProfileDef` — SimReady-style profile for robotics assets with PhysX-ready rigid bodies and colliders.

`SimProfileDef`: `{ kind: "profile", name: SimProfileName }`

#### `Sim.controller` — Standard controller metadata constructors for simulator package generation.

- `Sim.controller.diffDrive(options: SimDiffDriveControllerOptions): SimDiffDriveControllerDef` — Describe a differential-drive controller from left/right wheel joints and wheel dimensions.

**`SimDiffDriveControllerOptions`**: `leftJoints: string[]`, `rightJoints: string[]`, `wheelSeparationMm: number`, `wheelRadiusMm: number`, `topic?: string`, `odomTopic?: string`, `tfTopic?: string`, `frameId?: string`, `odomFrameId?: string`, `maxLinearVelocity?: number`, `maxAngularVelocity?: number`, `linearAcceleration?: number`, `angularAcceleration?: number`

`SimDiffDriveControllerDef`: `{ kind: "diffDrive" }`

#### `assembly(name?: string): Assembly` — Create an assembly container with named parts, connectors, and kinematic links.

**Use this from iteration 1 for any model with moving parts.** Do not build one static pose and retrofit motion later.

Two motion tools:

- **Link-graph kinematics** (`link()`, `edgeBetweenLinks()`, `addAngleBetweenLinks()`) solve named point positions — a link is a point, not a rigid-body frame. Use when the hard part is solving positions, especially closed loops.
- **Connector-frame joints** (`connect()` / `match()`) align full connector frames (`origin`, `axis`, `up`) and derive joint frame + axis. Use for serial articulated parts whose orientation matters: hips, hinges, drums, sliders, wheels.

`addPart(..., { mate })` places geometry on the solved link graph by **translation only**: one mate pins a connector origin to a link, two mates orient a part to span two solved links, a third pins roll. Right for markers and point-following geometry; use `connect()`/`match()` when the part needs a deterministic rest orientation.

Return the `Assembly` itself to expose its joints and driven link controls in the editor; moving a control re-runs `solve(state)`, so closed loops move through the real solver instead of a viewport-only FK approximation.

If no link in a connected kinematic component is fixed, ForgeCAD chooses a deterministic gauge link for solving and reports a floating-component warning.

A file that returns an `Assembly` is importable via [`require()`](/docs/core#require) and yields an `ImportedAssembly`; use `mergeInto()` to flatten it into a parent assembly.

**Point-link example** (mates a marker to the solved `tip` point; does not orient a bar along `ground -> tip`):

```ts
const marker = box(8, 8, 4).withConnectors({
  center: connector({ origin: [0, 0, 0], axis: [0, 0, 1] }),
});

const mech = assembly("Linkage")
  .link("ground", { at: [0, 0, 0], fixed: true })
  .link("worldX", { at: [10, 0, 0], fixed: true })
  .link("tip", { at: [40, 0, 0] })
  .edgeBetweenLinks("ground", "tip", { name: "bar" })
  .addAngleBetweenLinks("worldX", "ground", "tip", {
    name: "theta",
    control: { min: 0, max: 120, default: 30 },
  })
  .addPart("Tip marker", marker, { mate: { connector: "center", toLink: "tip" } });

return mech;
```

---

## Classes

### `Assembly`

Container for a kinematic mechanism made up of links, relationships, and parts. See `assembly` for the link-graph vs connector-frame decision rules.

Returning an unsolved `Assembly` keeps the graph available to the runtime; return `mech.solve({ theta: 60 })` for a fixed pose instead.

**Return types**

| Return value | Standalone | `require()` result type |
|---|---|---|
| `Assembly` (unsolved) | yes | `ImportedAssembly` |
| `SolvedAssembly` | yes | `SolvedAssembly` |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Kinematics**

#### `link(name: string, options?: AssemblyLinkOptions): Assembly` — Add a named kinematic link to the assembly graph.

Links are assembly-native solved points. They can exist before any geometry is attached, can be displayed by the viewport, and are solved by link/edge/angle constraints.

A link is not a rigid-body frame. It has a world position but no orientation basis. Use `connect()` when a physical part must inherit a connector frame and rotate about a real hinge/slider axis.

**`AssemblyLinkOptions`**
- `at?: Vec3` — Initial world-space position of this link before kinematic constraints solve it.
- `fixed?: boolean` — Keep the link locked at its authored `at` position during solves.
- `metadata?: Record<string, unknown>` — User metadata carried through the kinematic graph for inspection and tooling.

#### `linkAlong(name: string, fromLink: string, towardLink: string, distance: number): Assembly` — Create a derived link on the line through `fromLink` and `towardLink`, at a **signed** distance from `fromLink`.

**Sign convention** (read this first):

- `distance > 0` — the point moves from `fromLink` **toward** `towardLink`.
- `distance < 0` — the point moves from `fromLink` **away from** `towardLink` (the coupler-extension case, e.g. the Chebyshev lambda linkage's trace point beyond the rocker joint).
- `distance` greater than the solved edge length places the point **beyond** `towardLink`, still on the same line.

Derived links are trace/reference points. They are recomputed after the primary link solve and cannot participate in structural edges or angle constraints. Because the distance is one signed parameter, a `param()`-driven value can sweep continuously from extension (negative) through `fromLink` (zero) to beyond `towardLink` (large positive).

```ts
// Chebyshev lambda linkage: trace point C3 extends beyond C2, away from C1.
mech.linkAlong('C3', 'C2', 'C1', -2.5 * a);
// Midpoint-style reference 30 mm from A toward B:
mech.linkAlong('probe', 'A', 'B', 30);
```

#### `edgeBetweenLinks(a: string, b: string, options?: AssemblyEdgeBetweenLinksOptions): Assembly` — Add a relationship edge between two kinematic links.

By default the edge captures the authored distance between links as a structural length. Pass `{ length: 'free' }` or `{ visualOnly: true }` for a non-structural overlay edge.

**`AssemblyEdgeBetweenLinksOptions`**: `name?: string`, `length?: number | "lockCurrent" | "free"`, `min?: number`, `max?: number`, `visualOnly?: boolean`, `control?: AssemblyKinematicControlOptions`, `metadata?: Record<string, unknown>`

`AssemblyKinematicControlOptions`: `{ min?: number, max?: number, default?: number, unit?: string }`

#### `addAngleBetweenLinks(a: string, b: string, c: string, options?: AssemblyAngleBetweenLinksOptions): Assembly` — Add an angle relationship among three kinematic links.

The middle link is the vertex. When `control` is set, `solve(state)` reads the control value from `state[name]` and solves dependent links from that driven angle.

**`AssemblyAngleBetweenLinksOptions`**: `name?: string`, `value?: number`, `min?: number`, `max?: number`, `control?: boolean | AssemblyKinematicControlOptions`, `limit?: AssemblyKinematicLimitOptions`, `metadata?: Record<string, unknown>`

`AssemblyKinematicLimitOptions`: `{ min?: number, max?: number }`

#### `addAngleBetweenLinkSegmentAndWorldDirection(fromLink: string, toLink: string, direction: Vec3, options?: AssemblyAngleBetweenLinksOptions): Assembly` — Add an absolute angle relationship from a world direction to a link segment.

The first link is the vertex/pivot and the second link is the moving point. A value of `0` places `fromLink -> toLink` along `direction` in the mechanism plane; positive angles rotate counter-clockwise in that plane.

Use `Points.polar(1, angleDeg)` when the reference direction is planar and angle-based instead of axis-aligned.

#### `describeKinematics(): AssemblyKinematicGraphDef` — Return the assembly-native kinematic graph definition.

**Structure**

#### `addPart(name: string, part: AssemblyPart, options?: PartOptions): Assembly` — Add a named part to the assembly.

Connectors declared on the part (via `withConnectors()`) are captured automatically. Parts are positioned at world origin by default unless a `transform` is provided in `options`. For root parts (no incoming joint), `transform` is their final world position.

`options.mate` is for point-link attachments. During `solve()`, ForgeCAD translates the part so the named connector origin lands on the solved link position. The part keeps its existing orientation; connector `axis` and `up` are not used for link mating. Use this for markers, sensors, labels, and other geometry that should ride on a solved point. Use `connect()` for oriented physical parts such as limbs, levers, hinges, and wheels.

When a part is a [`ShapeGroup`](/docs/core#shapegroup), name the group children explicitly to get readable viewport labels (e.g. `"Base Assembly.Body"` instead of `"Base Assembly.1"`):

```ts
const housing = group(
  { name: "Body", shape: body },
  { name: "Lid", shape: lid },
);
assembly.addPart("Base Assembly", housing);
```

**`PartOptions`**: `transform?: TransformInput`, `metadata?: PartMetadata`, `sim?: SimBodyDef`, `mate?: AssemblyPartMateInput | AssemblyPartMateInput[]`, `bindToFrame?: string`

**`PartMetadata`**

| Option | Type | Description |
|--------|------|-------------|
| `tags?` | `string \| readonly string[]` | Viewport organization tags applied to scene objects produced from this part. |

Also: `material?: string`, `process?: string`, `tolerance?: string`, `qty?: number`, `notes?: string`, `densityKgM3?: number`, `massKg?: number`.

**`AssemblyPartMateInput`**
- `connector: string` — Name of a connector declared on the part (via `withConnectors()`).
- `toLink: string` — Name of the link this connector's origin is pinned to.
- `aimLink?: string` — Optional second link to orient toward. When set, the part is rotated so the connector's **axis** aims from `toLink` toward `aimLink`, posing an oriented bone instead of only translating it. For full pose without relying on a connector axis, declare a second mate (two connectors → two links).

#### `frame(name: string, options: AssemblyFrameOptions): Assembly` — Add a named rig frame to the assembly.

A frame is a solved pose: `origin` plus orientation. `axis` is the frame's primary direction and `up` fixes roll around that axis. Use frames for robot links, joint axes, and parts that must carry orientation. Use `link()` for solved points in distance/angle graphs.

`AssemblyFrameOptions`: `{ origin: Vec3, axis: Vec3, up: Vec3, fixed?: boolean, metadata?: Record<string, unknown> }`

#### `fixedJoint(name: string, options: AssemblyFixedFrameJointOptions): Assembly` — Rigidly attach a child rig frame to a parent rig frame.

Fixed joints carry frame hierarchy but do not expose a Motion control.

`AssemblyFixedFrameJointOptions`: `{ parent: string, child: string, metadata?: Record<string, unknown> }`

#### `revoluteJoint(name: string, options: AssemblyMovingFrameJointOptions): Assembly` — Add a revolute rig-frame joint.

The child frame rotates around the parent frame's `axis` direction. Moving frame joints appear in Motion by default; pass `control: false` to keep the joint solved at its default value without showing a Motion control.

**`AssemblyMovingFrameJointOptions`**: `parent: string`, `child: string`, `min?: number`, `max?: number`, `default?: number`, `unit?: string`, `control?: boolean`, `metadata?: Record<string, unknown>`

#### `prismaticJoint(name: string, options: AssemblyMovingFrameJointOptions): Assembly` — Add a prismatic rig-frame joint.

The child frame translates along the parent frame's `axis` direction. Moving frame joints appear in Motion by default; pass `control: false` to keep the joint solved at its default value without showing a Motion control.

**Connectors**

#### `get usedConnectorRefs(): ReadonlySet<string>` — Connector refs (e.g. "PartName.connectorName") consumed by connect/match calls.

#### `withConnectors(partName: string, connectors: Record<string, ConnectorInput>): Assembly` — Attach named connectors to a specific part or the assembly as a whole.

Connectors declared this way are in the part's local coordinate system. They are captured automatically if the incoming [`Shape`](/docs/core#shape) already has connectors via `shape.withConnectors(...)`, but you can also add or override connectors after the fact with this method.

Use the single-argument overload to attach assembly-level connectors — these are exposed when this assembly is imported as a sub-assembly.

`ConnectorInput` — defined in [core](/docs/core).

#### `getConnectors(partName: string): ConnectorMap` — Get connectors declared on a part in part-local space.

#### `getConnector(ref: string): { partName: string; connectorName: string; connector: ConnectorDef; }` — Parse a "PartName.connectorName" reference and return the resolved connector. Throws descriptive errors if the part or connector doesn't exist.

#### `connect(parentConnectorRef: string, childConnectorRef: string, options?: ConnectOptions): Assembly` — Connect two parts by aligning their declared connectors, automatically computing frame and axis.

Connector refs use `"PartName.connectorName"`. The child connector origin lands exactly on the parent connector origin; joint frame and axis are derived from the connector geometry — no manual `frame`/`axis` math.

Frame semantics: `origin` is the pivot/contact point, `axis` the hinge or slide direction, `up` locks the part's zero-state twist. Omitted `up` gets a deterministic perpendicular — provide `up` whenever rest orientation matters. (`addPart(..., { mate })` translates only; see `addPart`.)

**Face-to-face:** each connector's axis points outward from its part; mating makes the axes anti-parallel, like a plug meeting a socket (same convention as `matchTo()`).

**Revolute sign:** a positive joint value follows the right-hand rule about the **child** connector's placed axis. Because face-to-face mating makes the axes anti-parallel, that is the *left*-hand rule about the parent connector's outward axis — if `+30` swings the opposite way you expected, you predicted from the parent's axis. `forgecad debug assembly` prints each joint's resolved world axis.

**Mirrored revolute axes:** because of the right-hand rule, a mirrored hinge axis (`[1, 0, 0]` vs `[-1, 0, 0]`) rotates oppositely for the same `+theta`: negate the mirrored side's value and mirror limits as `[min, max] -> [-max, -min]`. Prismatic joints have no handedness flip. Use an explicit per-side sign mapping (or side-neutral link controls) for bilateral mechanisms.

Joint type defaults to the connector's `kind`. For `start`/`end` connectors, `align` / `parentAlign` / `childAlign` (`'start' | 'middle' | 'end'`) choose which point meets.

```ts
const frame = box(100, 10, 80).withConnectors({
  hinge: connector("hinge", { origin: [0, 0, 40], axis: [0, 0, 1], up: [1, 0, 0] }),
});
const door = box(60, 4, 80).withConnectors({
  hinge: connector("hinge", { origin: [0, 0, 40], axis: [0, 0, -1], up: [1, 0, 0] }),
});
assembly("Door").addPart("Frame", frame).addPart("Door", door)
  .connect("Frame.hinge", "Door.hinge", { as: "swing", min: 0, max: 110 });
```

**`ConnectOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `min?` | `number` | Lower joint-slider limit; solve clamps to it with a warning. Not a physical stop — enforce real travel limits with stop geometry. |
| `max?` | `number` | Upper joint-slider limit; same semantics as `min`. |
| `flip?` | `boolean` | This parameter is ignored. If your connectors produce wrong orientation, fix the connector axis directions instead of using flip. |
| `parentAlign?` | `PortAlign` | Which point on the parent connector to align: 'start', 'middle' (default), or 'end'. |
| `childAlign?` | `PortAlign` | Which point on the child connector to align: 'start', 'middle' (default), or 'end'. |
| `align?` | `PortAlign` | Shorthand: set both parentAlign and childAlign at once. |
| `follows?` | `JointFollowOptions` | Slave this joint to another joint: `value = ratio × source + offset` (e.g. a mirrored jaw with `ratio: -1`). |

Also: `as?: string`, `type?: JointType`, `default?: number`, `unit?: string`, `effort?: number`, `velocity?: number`, `damping?: number`, `friction?: number`, `drive?: SimDriveDef`.

**`JointFollowOptions`**
- `joint: string` — Name of the source joint that drives this one.
- `ratio?: number` — Multiplier applied to the source joint value (default 1).
- `offset?: number` — Constant added after the ratio (default 0).

#### `match(childPartName: string, parentPartName: string, pairs: Record<string, string>, options?: MatchToOptions & { as?: string; }): Assembly` — Auto-create a joint by matching typed connectors between two parts.

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
// Matching connectors computes the placement relationship automatically.
```

`MatchToOptions` — defined in [core](/docs/core).

**References**

#### `withReferences(refs: Pick<PlacementReferenceInput, "points">): Assembly` — Attach named placement reference points to this assembly. These are surfaced automatically on the ImportedAssembly when this file is imported via require(), so consumers can use placeReference() without re-declaring them. Returns a new Assembly — does not mutate.

`PlacementReferenceInput` — defined in [core](/docs/core).

**Solving**

#### `solve(state?: JointState): SolvedAssembly` — Solve the assembly at the given control state and return positioned parts.

Solves assembly-native kinematic links first. Controlled `addAngleBetweenLinks()` relationships read values from `state` by name, clamp to their declared limits, and expose the solved graph on `SolvedAssembly.kinematics`. Angles solve in the plane of their three authored link positions, so a limb that swings out of the `z = 0` plane poses correctly; structural edges hold their bone lengths so a fully angle-driven serial chain follows forward kinematics.

Connector mates declared on `addPart(..., { mate })` attach geometry to solved links while preserving part and connector identity:

- one mate **positions** the connector origin on its link;
- a mate with `aimLink` (or a second mate to another link) also **orients** the part, rotating an oriented bone to span its links rather than only translating it;
- a third mate **pins the roll** about the bone axis (full frame), e.g. a bore or clevis that must face a specific way.

Connector-frame joints created by `connect()` / `match()` are also evaluated; their values are read from `state` by joint name and clamped to joint limits.

```ts
return mech.solve({ theta: 45 });
```

**Other**

#### `withSimulation(options: SimAssemblySimulationOptions): Assembly` — Attach the root simulation contract for this assembly.

Use this after adding physical parts and joints. Robot-body profiles require `rootPart`; asset profiles can describe one-part or multi-part physical assets. URDF/SDF/MJCF/USD exporters and `forgecad check simready` read this contract directly from the returned assembly.

`SimAssemblySimulationOptions`: `{ profile: SimProfileDef, rootPart?: string, controllers?: SimControllerDef[] }`

#### `edgeBetweenFrames(a: string, b: string, options?: AssemblyFrameEdgeOptions): Assembly` — Add a visual skeleton edge between two rig frame origins.

Frame edges follow the solved frame poses produced by `fixedJoint()`, `revoluteJoint()`, and `prismaticJoint()`. They do not add constraints, degrees of freedom, parts, or geometry; use them to make a frame-only rig readable in the Motion/rig inspection overlay.

`AssemblyFrameEdgeOptions`: `{ name?: string, metadata?: Record<string, unknown> }`

#### `addAnimation(name: string, options: AssemblyAnimationOptions): Assembly` — Register a named keyframe animation for this assembly's Motion view.

Works with the returned-assembly controls path: return the unsolved `Assembly` and the animation appears in the Motion tab alongside the solver-backed joint controls. Keyframes hold control values by joint name; joints declared with `follows` are derived automatically and must not appear in keyframes.

```ts
robot.addAnimation("Pick and place", {
  duration: 12,
  loop: true,
  keyframes: [
    { values: { J1: 0, J2: -90 } },
    { values: { J1: 45, J2: -30 } },
    { values: { J1: 0, J2: -90 } },
  ],
});
return robot;
```

**`AssemblyAnimationOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `duration?` | `number` | Animation length in seconds (default chosen by the viewer). |
| `loop?` | `boolean` | Loop the animation (default false). |
| `continuous?` | `boolean` | Interpolate continuously through keyframes instead of pausing on each. |
| `keyframes` | `JointViewAnimationInput["keyframes"]` | Keyframes of control values by joint/control name. `at` (0..1) or `ticks` control timing. |
| `default?` | `boolean` | Make this the animation that plays when the model loads. |

`JointViewAnimationInput`: `{ name: string, duration?: number, loop?: boolean, continuous?: boolean, keyframes: JointViewAnimationKeyframeInput[] }`

**`JointViewAnimationKeyframeInput`**
- `at?: number` — Timeline position [0, 1]. If omitted from ALL keyframes, positions are auto-computed from tick weights.
- `ticks?: number` — Relative weight of the segment from this keyframe to the next (default 1). Only used in tick-based mode (when `at` is omitted). Last keyframe's ticks value is ignored.
- Also: `values: Record<string, number>`.

#### `describe(): AssemblyDefinition` — Return the serializable assembly definition used by solve/inspect pipelines.

**Compatibility Aliases**

- `withPorts()` -> `withConnectors()`
- `getPorts()` -> `getConnectors()`

### `ImportedAssembly`

A wrapper around an imported `Assembly` that provides kinematic access and convenient transform helpers.

When a `.forge.js` file returns an unsolved `Assembly`, [`require()`](/docs/core#require) wraps it in an `ImportedAssembly`. This preserves the kinematic structure — you can call `solve()` and `mergeInto()` — and converts to a static [`ShapeGroup`](/docs/core#shapegroup) via the explicit `toGroup(state?)` boundary when group-style transforms are needed.

**Kinematic access**

```ts
const arm = require("./arm.forge.js");

const solved = arm.solve({ shoulder: 45 });   // full kinematic solve
const link   = arm.getPart("Link", { shoulder: 60 }); // single part at state
const group  = arm.toGroup({ shoulder: 45 });  // only when ShapeGroup behavior is needed
```

**Static positioning** — convert explicitly, then transform the group (`toGroup()` solves at default joint values and discards kinematics):

```ts
const positioned = arm.toGroup().rotateZ(-90).translate(0, -20, 50);
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

#### `get assembly(): Assembly` — The underlying Assembly, for advanced composition and inspection.

#### `solve(state?: JointState): SolvedAssembly` — Solve the assembly at the given joint state (defaults to each joint's default value).

#### `getPart(partName: string, state?: JointState): AssemblyPart` — Return a specific named part positioned at the solved pose, with any stored placement offset applied.

This mirrors `SolvedAssembly.getPart()` for imported assemblies, with one addition: any offset stored by `placeReference()` is applied, so the part lands where the imported assembly was placed. (`solve(state).getPart(name)` returns the part in the assembly's own coordinates, without that offset.)

#### `toGroup(state?: JointState): ShapeGroup` — Convert all assembly parts to a ShapeGroup with named children. Use this for composition, transforms, or child lookup — not as a required render step for assemblies. Child names match the part names used in the assembly. Any stored placement offset and placement references are forwarded to the group.

#### `withReferences(refs: Pick<PlacementReferenceInput, "points">): ImportedAssembly` — Attach named placement reference points to this assembly. Points are simple 3D coordinates (relative to the assembly's own origin). Returns a new ImportedAssembly — does not mutate.

#### `referenceNames(kind?: PlacementReferenceKind): string[]` — List all attached placement reference names.

#### `placeReference(ref: string, target: Vec3, offset?: Vec3): ImportedAssembly` — Translate the assembly so the named reference point lands on `target`. Returns a new ImportedAssembly — does not mutate. All point refs are translated by the same delta.

#### `child(name: string): Shape | Sketch | ShapeGroup` — Solve at defaults, get a named child part from the resulting group.

#### `collisionReport(options?: CollisionOptions): CollisionFinding[]` — Detect overlapping part pairs at the default solved pose.

This mirrors `SolvedAssembly.collisionReport()` for imported assemblies. Use `solve(state).collisionReport(options)` when inspecting a non-default joint state.

`CollisionOptions`: `{ parts?: string[], ignorePairs?: Array<[ string, string ]>, minOverlapVolume?: number }`

#### `minClearance(partA: string, partB: string, searchLength?: number): number` — Compute the minimum gap between two parts at the default solved pose.

This mirrors `SolvedAssembly.minClearance()` for imported assemblies. Use `solve(state).minClearance(partA, partB, searchLength)` when inspecting a non-default joint state.

#### `mergeInto(parent: Assembly, options: MergeIntoOptions): Assembly` — Flatten this sub-assembly's parts and relationships into `parent` and wire a mount relationship.

All part, link, and legacy joint names from the sub-assembly are prefixed with `"${options.prefix}."` to avoid collisions; connectors are forwarded with the same prefix. After the merge, drive controls from the parent using the prefixed names:

```ts
parent.solve({ "Left Arm.theta": 45, "Right Arm.theta": -20 })
```

The sub-assembly must have exactly one root part before it can be merged (collapse multiple roots with `addFixed()` first). See the `ImportedAssembly` class docs for a full merge example.

**`MergeIntoOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `prefix?` | `string` | Prefix applied to every part name and joint name from the sub-assembly. E.g. prefix "Left Arm" turns part "Base" into "Left Arm.Base". Strongly recommended to avoid name collisions when merging multiple instances. |
| `mountParent` | `string` | Part name in the parent assembly to attach the sub-assembly root to. |
| `mountJoint` | `string` | Name for the new mount joint in the parent graph. |
| `mountType?` | `JointType` | Joint type for the mount connection (default: 'fixed'). |
| `mountOptions?` | `JointOptions` | Frame, axis, limits, and other options for the mount joint. |

**`JointOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `connectorRefs?` | `JointConnectorRefs` | Connector refs that define this joint contract. Usually set by `connect()` / `match()`. |
| `follows?` | `JointFollowOptions` | Slave this joint to another joint: `value = ratio × source + offset`. Use for mechanisms with one physical DOF expressed through several joints — a mirrored gripper jaw (`ratio: -1`), a gear pair, a drive crank turning with its servo. A followed joint stops being an independent control: the Motion view drives it from its source, `solve()` derives its value (a direct state override is ignored with a warning), and limits still clamp the derived value. |

Also: `frame?: TransformInput`, `origin?: Vec3`, `axis?: Vec3`, `min?: number`, `max?: number`, `default?: number`, `unit?: string`, `effort?: number`, `velocity?: number`, `damping?: number`, `friction?: number`, `drive?: SimDriveDef`.

`JointConnectorRefs`: `{ parent: string, child: string, parentAlign?: PortAlign, childAlign?: PortAlign }`

### `SolvedAssembly`

The result of solving an assembly at a specific joint state.

`SolvedAssembly` holds world-space transforms for every part at a given pose. Top-level scripts can return a `SolvedAssembly` directly for display. Use `toGroup()` when you specifically need a [`ShapeGroup`](/docs/core#shapegroup) for composition, group-style transforms, or named-child lookup. Do not call `toGroup()` just to make a solved assembly render. Use `getPart()` / `getTransform()` to inspect individual parts programmatically.

**Validation**

Call `collisionReport()` to detect overlapping parts at this solved pose.

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

#### `warnings(): string[]` — Return any warnings generated during solve (clamped joints, unconverged mates, etc.).

#### `getJointState(): JointState` — Return a snapshot of resolved joint values (after clamping and coupling).

#### `get kinematics(): SolvedAssemblyKinematics | null` — Solved assembly-native kinematic or frame-edge overlay data, or null when no rig overlay data was declared.

#### `getLinkPosition(linkName: string): Vec3` — Return the solved world position of a kinematic link.

#### `getFrame(frameName: string): Transform` — Return the solved world transform for a named rig frame.

#### `get frames(): SolvedAssemblyFrameDef[]` — Return solved rig frames, including origin, axis, up, and transform.

#### `getTransform(partName: string): Transform` — Return the world-space [`Transform`](/docs/core#transform) for the named part at the solved pose.

#### `getPart(partName: string): AssemblyPart` — Return the named part already positioned at its solved world transform.

#### `toGroup(): ShapeGroup` — Convert all solved parts into a [`ShapeGroup`](/docs/core#shapegroup) with named children.

Each part becomes a named child in the group, already positioned at its solved world transform. Use this only when you specifically need a [`ShapeGroup`](/docs/core#shapegroup) for composition, [`ShapeGroup`](/docs/core#shapegroup) transforms, or named-child access. Top-level scripts can return the `SolvedAssembly` directly; do not call `toGroup()` just to make a solved assembly render.

```ts
const armGroup = mech.solve({ shoulder: 60 }).toGroup(); // only because we need rotateZ()
return armGroup.rotateZ(90);
```

#### `toSceneObjects(): Array<{ ... }>` — Return an array of named scene objects for the viewport renderer.

Each part becomes `{ name, shape }` or `{ name, group: [...] }` if the part is a [`ShapeGroup`](/docs/core#shapegroup). Top-level scripts should normally return the `SolvedAssembly` directly. Use `toGroup()` when you need [`ShapeGroup`](/docs/core#shapegroup) behavior; use this method only for advanced scene-graph control where you need access to the flat per-part array with metadata.

#### `bom(): BomRow[]` — Generate a bill of materials for all parts in the solved assembly.

#### `bomCsv(): string` — Generate a bill of materials as a CSV string.

#### `collisionReport(options?: CollisionOptions): CollisionFinding[]` — Detect overlapping (colliding) part pairs in this solved pose.

Computes boolean intersections between all part pairs and returns findings where the overlap volume exceeds `minOverlapVolume` (default 0.1 mm³).

```ts
const solved = mech.solve({ shoulder: 35, elbow: 60 });
console.log("Collisions", solved.collisionReport());
```

#### `minClearance(partA: string, partB: string, searchLength?: number): number` — Compute the minimum gap (clearance) between two parts in this solved pose.

Returns `0` if the parts are touching or overlapping. Manifold-backed parts use the exact Manifold gap query. SDF-backed parts use a mesh-derived sampled gap. `searchLength` bounds the Manifold search radius in mm — increase it for widely separated Manifold parts.

# Assembly + Mechanism API

Use this API when your model is a mechanism, not a single booleaned solid.

## Mental model
- `Part` = manufacturable object (shape + metadata)
- `Joint` = relationship between parent and child part
- `State` = current joint values
- `Solve` = compute world transforms for all parts
- `Validate` = collisions / clearances / sweep checks

## Quick start

```javascript
const mech = assembly("Arm")
  .addPart("base", box(80, 80, 20, true), {
    metadata: { material: "PETG", process: "FDM", qty: 1 },
  })
  .addPart("link", box(140, 24, 24).translate(0, -12, -12))
  .addJoint("shoulder", "revolute", "base", "link", {
    axis: [0, 1, 0],
    min: -30,
    max: 120,
    default: 25,
    frame: Transform.identity().translate(0, 0, 20),
  });

const solved = mech.solve();
return solved.toScene();
```

## Ergonomic helpers
- `addFrame(name, { transform? })` adds a virtual reference frame (no geometry)
- `addRevolute(name, parent, child, opts)` shorthand for `addJoint(..., "revolute", ...)`
- `addPrismatic(name, parent, child, opts)` shorthand for `addJoint(..., "prismatic", ...)`
- `addFixed(name, parent, child, opts)` shorthand for `addJoint(..., "fixed", ...)`
- `addJointCoupling(jointName, { terms, offset? })` links joints with linear relationships
- `addGearCoupling(drivenJoint, driverJoint, opts)` links revolute joints using gear ratios

## Joint couplings

Use couplings when one joint should be derived from other joints.

Formula:
- `driven = offset + Σ(ratio_i * source_i)`

Example:

```javascript
const mech = assembly("Differential")
  .addFrame("Base")
  .addFrame("Turret")
  .addFrame("Wheel")
  .addFrame("TopInput")
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

Notes:
- Coupled joints ignore direct values in `solve(state)` and emit a warning.
- Coupling cycles are rejected.
- `sweepJoint(...)` cannot sweep a coupled target; sweep one of its source joints instead.

## Gear couplings

Use this helper to connect two **revolute** joints as a gear mesh without manually writing `addJointCoupling(...)`.

```javascript
const pair = lib.gearPair({
  pinion: { module: 1.25, teeth: 14, faceWidth: 8 },
  gear: { module: 1.25, teeth: 42, faceWidth: 8 },
});

const mech = assembly("Spur Stage")
  .addFrame("Base")
  .addFrame("PinionPart")
  .addFrame("GearPart")
  .addRevolute("Pinion", "Base", "PinionPart", { axis: [0, 0, 1] })
  .addRevolute("Driven", "Base", "GearPart", { axis: [0, 0, 1] })
  .addGearCoupling("Driven", "Pinion", { pair }); // uses pair.jointRatio
```

`addGearCoupling(...)` ratio sources (choose exactly one):
- `ratio` (explicit multiplier)
- `pair` (`lib.gearPair(...)`, `lib.bevelGearPair(...)`, or `lib.faceGearPair(...)` result using `pair.jointRatio`)
- `driverTeeth` + `drivenTeeth` (auto ratio; `internal` mesh is positive, `external`/`bevel`/`face` are negative)

For bevel stages, pairing helpers also return placement aids:
- `pinionAxis`, `gearAxis`
- `pinionCenter`, `gearCenter`

For face stages, use `centerDistance` and `meshPlaneZ` from `lib.faceGearPair(...)`; with `place: true`, the face gear stays on the Z axis and the vertical spur is placed at `[centerDistance, 0, meshPlaneZ]`.

## Joint frames

`frame` is a transform from the **parent part frame** to the **joint frame at zero state**.

For a child part:

Matrix form:
- `childWorld = parentWorld * frame * motion(value) * childBase`

Forge chain form:
- `childWorld = composeChain(childBase, motion(value), frame, parentWorld)`

This keeps kinematic chains declarative and avoids repeated manual pivot math.

## Validation helpers
- `solved.collisionReport()` returns overlapping part pairs and volume
- `solved.minClearance("PartA", "PartB", 10)` computes minimum gap
- `assembly.sweepJoint("elbow", -20, 140, 24)` samples motion and reports collisions

Notebook-friendly pattern:

```javascript
const solved = mech.solve({ shoulder: 35, elbow: 60 });
console.log("Collisions", solved.collisionReport());

const sweep = mech.sweepJoint("elbow", -10, 135, 12, { shoulder: 35 });
console.log("Sweep collisions", sweep.filter((step) => step.collisions.length > 0).length);

show(solved.toScene());
```

That keeps mechanism setup in earlier cells and collision/sweep investigation in the current preview cell.

## Importing assemblies from other files

Use `importAssembly(fileName, paramOverrides?)` to import an assembly defined in another file. The source file must `return` the `Assembly` instance directly (not `.solve()`).

```javascript
// arm.forge.js — source file
const mech = assembly("Arm")
  .addPart("Base", box(80, 80, 20, true))
  .addPart("Link", box(140, 24, 24).translate(0, -12, -12))
  .addRevolute("shoulder", "Base", "Link", {
    axis: [0, 1, 0],
    min: -30,
    max: 120,
    default: 25,
    frame: Transform.identity().translate(0, 0, 20),
  });

return mech; // return Assembly, not mech.solve()
```

```javascript
// scene.forge.js — consumer
const arm = importAssembly("arm.forge.js");

// Access named parts by name (positioned at default or given joint state)
const base = arm.part("Base");
const link = arm.part("Link", { shoulder: 60 });

// Convert to a ShapeGroup — children named after assembly part names
const g = arm.toGroup({ shoulder: 45 });
const baseChild = g.child("Base");

// Full kinematic access
arm.assembly.sweepJoint("shoulder", -30, 120, 24);
const solved = arm.solve({ shoulder: 45 });
console.log(solved.bom());

return arm.toGroup({ shoulder: 45 });
```

## Merging sub-assemblies into a parent

`importedAssembly.mergeInto(parent, options)` flattens a sub-assembly's parts and joints into a parent `Assembly`, then wires a mount joint connecting a parent part to the sub-assembly root. After the merge, the parent graph can drive sub-assembly joints directly.

```javascript
// scene.forge.js
const chassis = box(200, 80, 20, true);

const robot = assembly("Robot")
  .addPart("Chassis", chassis);

// Merge left arm — all parts/joints prefixed "Left Arm."
importAssembly("arm.forge.js")
  .mergeInto(robot, {
    prefix: "Left Arm",
    mountParent: "Chassis",
    mountJoint: "leftMount",
    mountOptions: { frame: Transform.identity().translate(-70, 0, 10) },
  });

// Merge right arm — same source file, different prefix and position
importAssembly("arm.forge.js")
  .mergeInto(robot, {
    prefix: "Right Arm",
    mountParent: "Chassis",
    mountJoint: "rightMount",
    mountOptions: { frame: Transform.identity().translate(70, 0, 10) },
  });

// Drive sub-assembly joints from the parent using prefixed names
const solved = robot.solve({
  "Left Arm.shoulder": 45,
  "Right Arm.shoulder": -20,
});
return solved.toScene();
```

**`mergeInto(parent, options)` options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `prefix` | `string` | recommended | Prefix for all part and joint names. `"Left Arm"` turns `"Base"` into `"Left Arm.Base"`. |
| `mountParent` | `string` | yes | Part name in `parent` to attach the sub-assembly root to. |
| `mountJoint` | `string` | yes | Name for the new mount joint in the parent graph. |
| `mountType` | `JointType` | no | Joint type for the mount (default: `'fixed'`). |
| `mountOptions` | `JointOptions` | no | Frame, axis, limits, etc. for the mount joint. |

**Notes:**
- The sub-assembly must have exactly one root part. If it has multiple roots, connect them with `addFixed()` first.
- Joint couplings inside the sub-assembly are preserved and rewritten with the prefix.
- After merging, use `parent.sweepJoint("Left Arm.shoulder", ...)` for collision sweeps across the full hierarchy.
- Returns `parent` for chaining.

## Common pitfalls
- **Animating assemblies with `jointsView`**: If you use [`jointsView()`](../runtime/viewport.md) to animate an assembly, solve the assembly at rest pose (all animated joints = 0) and let `jointsView` control posing via `default` values and animation keyframes. Solving at non-zero angles and then animating will double-rotate parts. See the [viewport docs](../runtime/viewport.md#using-jointsview-with-assemblies) for the full pattern.
- If parts vanish in the viewport, check whether a cut plane is active before debugging kinematics. The viewer-side APIs live in [../runtime/viewport.md](../runtime/viewport.md).
- If a returned object is empty, Forge logs a warning in script output.
- `importAssembly()` requires the source file to return the `Assembly` object before calling `.solve()`. If you call `.solve()` in the source file and return a `SolvedAssembly`, use `importGroup()` instead (convert with `.toScene()` → group).

## Metadata
- `addPart(..., { metadata })` attaches per-part metadata to an assembly part.
- BOM/report helpers such as `solved.bom()` and `solved.bomCsv()` live in [../output/bom.md](../output/bom.md).

## Naming grouped assembly children

When an assembly part is a `ShapeGroup`, Forge flattens the group into separate viewport objects. To avoid opaque labels like `Base Assembly.1`, name the group children explicitly:

```javascript
const housing = group(
  { name: "Body", shape: body },
  { name: "Lid", shape: lid },
);

const mech = assembly("Case")
  .addPart("Base Assembly", housing);
```

That produces labels such as `Base Assembly.Body` and `Base Assembly.Lid`.

## Robot export

Use `robotExport({...})` when an assembly should become a simulator package instead of only a viewport scene.

```javascript
const rover = assembly("Scout")
  .addPart("Chassis", box(300, 220, 50, true))
  .addPart("Left Wheel", cylinder(30, 60, undefined, 48, true).pointAlong([0, 1, 0]))
  .addPart("Right Wheel", cylinder(30, 60, undefined, 48, true).pointAlong([0, 1, 0]))
  .addRevolute("leftWheel", "Chassis", "Left Wheel", {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(90, 140, 60),
    effort: 20,
    velocity: 1080,
  })
  .addRevolute("rightWheel", "Chassis", "Right Wheel", {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(90, -140, 60),
    effort: 20,
    velocity: 1080,
  });

robotExport({
  assembly: rover,
  modelName: "Scout",
  links: {
    Chassis: { massKg: 10 },
    "Left Wheel": { massKg: 0.8 },
    "Right Wheel": { massKg: 0.8 },
  },
  plugins: {
    diffDrive: {
      leftJoints: ["leftWheel"],
      rightJoints: ["rightWheel"],
      wheelSeparationMm: 280,
      wheelRadiusMm: 60,
    },
  },
  world: {
    generateDemoWorld: true,
  },
});
```

Notes:
- Revolute joint `velocity` values are expressed in degrees/second in Forge; the SDF exporter converts them to radians/second.
- Prismatic distances are authored in millimeters and exported in meters.
- `massKg` is preferred for demo robots; `densityKgM3` is a decent fallback when mass is unknown.

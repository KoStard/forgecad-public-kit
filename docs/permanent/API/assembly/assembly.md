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

return mech; // auto-solved at defaults, renders all parts
```

Returning `mech` (unsolved Assembly) auto-solves at default joint values and renders all parts.  You can also return a `SolvedAssembly` for a specific pose:

```javascript
return mech.solve({ shoulder: 60 });
```

## Return types and imports — how they fit together

| Return value | Standalone | `importPart` | `importGroup` | `importAssembly` |
|---|---|---|---|---|
| `Shape` | yes | yes | — | — |
| `Sketch` | yes | — | — | — |
| `ShapeGroup` | yes | — | yes | — |
| `Assembly` (unsolved) | **yes** | — | — | yes |
| `SolvedAssembly` | **yes** | — | — | — |

**`Assembly` is the dual-use type**: a file that returns an unsolved `Assembly` works both as a standalone renderable script *and* as an import target for `importAssembly()`.

Pattern for dual-use assembly files:

```javascript
// handle.forge.js — works standalone AND importable via importAssembly()
const mech = assembly("Handle")
  .addPart("Base", baseBracket)
  .addPart("Arm", arm)
  .addRevolute("Fold", "Base", "Arm", { axis: [0, 1, 0], min: 0, max: 90 });

// Animation setup — runs when standalone, ignored on import
mech.toJointsView({
  animations: [{ name: "Fold", duration: 2, loop: true,
    keyframes: [{ at: 0, values: { Fold: 0 } }, { at: 0.5, values: { Fold: 90 } }, { at: 1, values: { Fold: 0 } }],
  }],
});

return mech; // works standalone (auto-solved + animated) AND with importAssembly()
```

```javascript
// case.forge.js — imports the handle as a positioned assembly
const handle = importAssembly("./handle.forge.js");

// Convenience transforms: solve at defaults, return ShapeGroup
const handleGroup = handle.rotate(0, 0, -90).translate(0, -20, 50);

return [
  { name: "Case", shape: caseBody },
  { name: "Handle", shape: handleGroup },
];
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

## SolvedAssembly

`mech.solve(state?)` returns a `SolvedAssembly` with these methods:

| Method | Returns | Use for |
|--------|---------|---------|
| `toGroup()` | `ShapeGroup` | Primary way to get positioned parts as a group — for `show()`, embedding, transforms |
| `getPart(name)` | `AssemblyPart` | Extract a single part at its solved position |
| `getTransform(name)` | `Transform` | Raw world transform for a part |
| `bom()` / `bomCsv()` | `BomRow[]` / `string` | Bill of materials |
| `collisionReport()` | `CollisionFinding[]` | Interference detection |
| `minClearance(a, b)` | `number` | Minimum gap between two parts |
| `toSceneObjects()` | `Array<{name, shape?, group?}>` | Advanced: raw scene-graph array for custom rendering |

**`toGroup()`** is the preferred way to convert a solved assembly to a positionable group:

```javascript
const solved = mech.solve({ shoulder: 45 });
show(solved.toGroup()); // in notebooks
```

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

show(solved);
```

That keeps mechanism setup in earlier cells and collision/sweep investigation in the current preview cell.

## ImportedAssembly

`importAssembly()` returns an `ImportedAssembly` with these capabilities:

### Kinematic access

```javascript
const arm = importAssembly("arm.forge.js");

// Full kinematic access
const solved = arm.solve({ shoulder: 45 });
console.log(solved.bom());
arm.assembly.sweepJoint("shoulder", -30, 120, 24);
```

### Extracting parts

```javascript
const base = arm.part("Base");                   // at default state
const link = arm.part("Link", { shoulder: 60 }); // at specific state
```

### Converting to group

```javascript
const g = arm.toGroup({ shoulder: 45 }); // ShapeGroup with named children
const baseChild = g.child("Base");
```

### Convenience transforms

`ImportedAssembly` has `.rotate()`, `.translate()`, `.scale()`, `.mirror()`, `.color()`, and `.child()` that auto-solve at defaults and return a `ShapeGroup`:

```javascript
const handle = importAssembly("./handle.forge.js");
const positioned = handle.rotate(0, 0, -90).translate(0, -20, 50);
// positioned is a ShapeGroup — use directly in named arrays or group()
```

### Placement references

```javascript
const arm = importAssembly("arm.forge.js");
const placed = arm.placeReference("mountHole", [100, 0, 50]);
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
return robot.solve({
  "Left Arm.shoulder": 45,
  "Right Arm.shoulder": -20,
});
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

### Export formats

```bash
# SDF package (Gazebo/Ignition) — generates model.sdf + world + STL meshes
forgecad export sdf model.forge.js

# URDF package (ROS/PyBullet/MuJoCo) — generates .urdf + STL meshes
forgecad export urdf model.forge.js
```

Both exporters produce:
- **Mesh-based inertia tensors** — computed from actual triangle geometry via divergence theorem (not bounding-box approximation). Includes full 6-component tensor (Ixx, Iyy, Izz, Ixy, Ixz, Iyz) and center of mass.
- **Separate collision meshes** — controlled per-link via `collision` option.
- **Joint mimic elements** — joint couplings (`addJointCoupling`, `addGearCoupling`) are exported as `<mimic>` elements in both SDF and URDF.

### Collision mesh modes

Set per-link in `robotExport({ links: { "PartName": { collision: mode } } })`:

| Mode | Description | Default |
|------|-------------|---------|
| `'convex'` | Convex hull of visual geometry (separate `_collision.stl`). Typically 50-80% smaller. | **Yes** |
| `'box'` | Axis-aligned bounding box primitive. Fastest physics but least accurate. | |
| `'visual'` | Same mesh as visual. Exact but slow for simulation. | |
| `'none'` | No collision geometry. Link passes through other objects. | |

### Notes

- Revolute joint `velocity` values are expressed in degrees/second in Forge; the exporters convert them to radians/second.
- Prismatic distances are authored in millimeters and exported in meters.
- `massKg` is preferred for demo robots; `densityKgM3` is a decent fallback when mass is unknown.
- Joint couplings with multiple terms use the primary term (largest ratio) for `<mimic>` since SDF/URDF only support single-leader mimic. A warning is emitted for dropped terms.

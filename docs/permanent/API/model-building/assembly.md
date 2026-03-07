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

For bevel/face stages, pairing helpers also return placement aids:
- `pinionAxis`, `gearAxis`
- `pinionCenter`, `gearCenter`

These vectors are useful when wiring joints in `jointsView(...)` or setting up assembly joint frames.

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

## Common pitfalls
- If parts vanish in the viewport, check whether a cut plane is active before debugging kinematics. The viewer-side APIs live in [../runtime/viewport.md](../runtime/viewport.md).
- If a returned object is empty, Forge logs a warning in script output.

## Metadata
- `addPart(..., { metadata })` attaches per-part metadata to an assembly part.
- BOM/report helpers such as `solved.bom()` and `solved.bomCsv()` live in [../output/bom.md](../output/bom.md).

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

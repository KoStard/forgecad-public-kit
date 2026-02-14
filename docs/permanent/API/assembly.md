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
- If parts vanish, check whether section clipping is enabled before debugging kinematics.
- If a returned object is empty, Forge logs a warning in script output.

## Manufacturing helpers
- Per-part metadata in `addPart(..., { metadata })`
- `solved.bom()` returns JSON-ready rows
- `solved.bomCsv()` / `bomToCsv(rows)` for CSV export

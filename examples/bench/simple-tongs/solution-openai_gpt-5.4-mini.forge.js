const ArmA = union(
  box(120, 12, 8).translate(60, 0, 0),
  box(26, 18, 8).translate(13, 0, 0),
  cylinder(8, 6, 6, 24, true).rotate(0, 90, 0).translate(0, 0, 0)
);

const ArmB = union(
  box(120, 12, 8).translate(-60, 0, 0),
  box(26, 18, 8).translate(-13, 0, 0),
  cylinder(8, 6, 6, 24, true).rotate(0, 90, 0).translate(0, 0, 0)
);

const asm = assembly("SimpleTongs")
  .addPart("ArmA", ArmA)
  .addPart("ArmB", ArmB)
  .addRevolute("pivot", "ArmA", "ArmB", {
    axis: [0, 0, 1],
    min: 0,
    max: 30,
    default: 0,
    frame: Transform.identity().translate(0, 0, 0)
  });

return asm;
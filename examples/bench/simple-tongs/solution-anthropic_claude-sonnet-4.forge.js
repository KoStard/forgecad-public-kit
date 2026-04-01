// Create the two tong arms
const armLength = 150;
const armWidth = 15;
const armThickness = 8;
const jawLength = 40;
const jawWidth = 20;

// Create arm A (left arm)
const handleA = box(armLength, armWidth, armThickness).translate(-armLength/2, 0, 0);
const jawA = box(jawLength, jawWidth, armThickness).translate(-armLength - jawLength/2, 0, 0);
const armA = union(handleA, jawA);

// Create arm B (right arm) - mirrored
const handleB = box(armLength, armWidth, armThickness).translate(-armLength/2, 0, 0);
const jawB = box(jawLength, jawWidth, armThickness).translate(-armLength - jawLength/2, 0, 0);
const armB = union(handleB, jawB);

// Create the assembly
const tongs = assembly("Tongs")
  .addPart("ArmA", armA)
  .addPart("ArmB", armB)
  .addRevolute("pivot", "ArmA", "ArmB", {
    axis: [0, 0, 1],
    min: 0,
    max: 30,
    default: 0,
    frame: Transform.identity().translate(0, 0, 0)
  });

return tongs;
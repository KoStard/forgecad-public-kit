// Broken solution: Fundamentally wrong design
//
// Problems:
// - ArmB is a tiny cube — not a functional arm
// - Joint is prismatic (slides) instead of revolute (rotates)
// - Parts are 50mm apart — physically impossible joint
// - No meaningful gripping geometry

// ArmA: normal-ish arm
const armA = box(120, 15, 5)
  .translate(0, 0, 0)
  .color("#5588aa");

// ArmB: tiny cube, not a real arm
const armB = box(5, 5, 5)
  .translate(0, -50, 0) // way too far from ArmA — impossible joint
  .color("#aa5555");

const mech = assembly("Broken Tongs")
  .addPart("ArmA", armA)
  .addPart("ArmB", armB)
  .addPrismatic("pivot", "ArmA", "ArmB", { // wrong joint type!
    axis: [1, 0, 0], // slides along X instead of rotating
    min: -10,
    max: 50,
    default: 0,
    frame: Transform.identity(),
  });

return mech;

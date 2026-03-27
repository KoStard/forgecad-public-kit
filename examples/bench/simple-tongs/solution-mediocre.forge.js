// Mediocre solution: Tongs that mostly work but have functional issues
//
// Problems:
// - Large gap between arms when closed (20mm) — can't grip small objects
// - Joint max is only 15 degrees — can't open wide enough
// - Short stubby arms — poor reach and leverage

const armLen = 60; // too short
const armWidth = 15;
const armThick = 5;
const gap = 20; // way too large — can't grip

// ArmA: bar along +X, inner edge at Y = +gap/2
const armA = box(armLen, armWidth, armThick)
  .translate(0, gap / 2, -armThick / 2)
  .color("#5588aa");

// ArmB: bar along +X, inner edge at Y = -gap/2
const armB = box(armLen, armWidth, armThick)
  .translate(0, -gap / 2 - armWidth, -armThick / 2)
  .color("#aa5555");

const mech = assembly("Mediocre Tongs")
  .addPart("ArmA", armA)
  .addPart("ArmB", armB)
  .addRevolute("pivot", "ArmA", "ArmB", {
    axis: [0, 0, 1],
    min: -2,
    max: 15, // too limited — can't open to 30
    default: 0,
    frame: Transform.identity().translate(5, 0, 0),
  });

return mech;

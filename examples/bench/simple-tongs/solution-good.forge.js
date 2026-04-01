// Good solution: Well-designed tongs with correct kinematics
//
// Two flat arms stacked in Z (one slightly above the other), pivot at handle end.
// This prevents collision during opening — arms rotate in the XY plane
// at different Z heights, just like real kitchen tongs.

const armLen = 150;
const armWidth = 15;
const armThick = 5;
const gap = 2; // 2mm vertical gap between stacked arms

// ArmA: bar along +X, bottom arm
const armA = box(armLen, armWidth, armThick)
  .translate(0, -armWidth / 2, 0)
  .color("#5588aa");

// ArmB: bar along +X, top arm (offset in Z)
const armB = box(armLen, armWidth, armThick)
  .translate(0, -armWidth / 2, armThick + gap)
  .color("#aa5555");

const mech = assembly("Simple Tongs")
  .addPart("ArmA", armA)
  .addPart("ArmB", armB)
  .addRevolute("pivot", "ArmA", "ArmB", {
    axis: [0, 0, 1],
    min: -5,
    max: 45,
    default: 0,
    frame: Transform.identity().translate(0, 0, armThick + gap),
  });

return mech;

// Expert solution: Door hinge
// Two plates side-by-side along X, hinge at X=0 edge, stacked in Z to avoid collision

const plateW = 80;
const plateD = 60;
const plateT = 6;

const frame = box(plateW, plateD, plateT).translate(0, 0, 0).color("#888888");
const door = box(plateW, plateD, plateT).translate(0, 0, plateT + 1).color("#4466aa"); // stacked above with 1mm gap

return assembly("Door Hinge")
  .addPart("Frame", frame)
  .addPart("Door", door)
  .addRevolute("hinge", "Frame", "Door", {
    axis: [0, 0, 1],
    min: 0,
    max: 180,
    default: 0,
    frame: Transform.identity().translate(0, 0, plateT + 1),
  });

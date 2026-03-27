const plateThickness = 5;
const plateWidth = 40;
const plateHeight = 80;
const hingeRadius = 5;
const hingeLength = plateThickness * 2;

// Frame plate: vertical rectangle with hinge cylinder on left edge
const framePlate = box(plateThickness, plateWidth, plateHeight, true)
  .translate(plateThickness/2, 0, plateHeight/2);

// Door plate: vertical rectangle with hinge cylinder on right edge
const doorPlate = box(plateThickness, plateWidth, plateHeight, true)
  .translate(-plateThickness/2, 0, plateHeight/2);

// Hinge pin cylinders on both plates, aligned on Z axis at left edge of door plate and right edge of frame plate
const hingePinFrame = cylinder(hingeLength, hingeRadius, undefined, 32, true)
  .translate(plateThickness/2, 0, plateHeight/2);

const hingePinDoor = cylinder(hingeLength, hingeRadius, undefined, 32, true)
  .translate(-plateThickness/2, 0, plateHeight/2);

// Combine plates with hinge pins for physical realizability
const frame = union(framePlate, hingePinFrame).color("#8888cc");
const door = union(doorPlate, hingePinDoor).color("#cc8888");

// Assembly and revolute joint along Z axis at hinge pin center
const asm = assembly("doorHinge")
  .addPart("Frame", frame)
  .addPart("Door", door)
  .addRevolute("hinge", "Frame", "Door", {
    axis: [0, 0, 1],
    min: 0,
    max: 90,
    default: 0,
    frame: Transform.identity().translate(plateThickness/2, 0, plateHeight/2)
  });

return asm;
const frameWidth = 80;
const frameHeight = 120;
const frameThickness = 10;
const doorWidth = 60;
const doorHeight = 100;
const doorThickness = 8;
const hingeOffset = 15;

// Create frame plate - positioned so hinge axis is at its edge
const framePlate = box(frameWidth, frameThickness, frameHeight, true)
  .translate(frameWidth/2 - hingeOffset, 0, 0)
  .color("#8B4513");

// Create door plate - positioned to align with frame when closed
const doorPlate = box(doorThickness, doorWidth, doorHeight, true)
  .translate(0, doorWidth/2, 0)
  .color("#CD853F");

// Create assembly
const doorHinge = assembly("DoorHinge")
  .addPart("Frame", framePlate)
  .addPart("Door", doorPlate, {
    frame: Transform.identity().translate(hingeOffset, 0, 0)
  })
  .addRevolute("hinge", "Frame", "Door", {
    axis: [0, 0, 1],
    min: 0,
    max: 90,
    default: 0,
    frame: Transform.identity().translate(hingeOffset, 0, 0)
  });

return doorHinge;
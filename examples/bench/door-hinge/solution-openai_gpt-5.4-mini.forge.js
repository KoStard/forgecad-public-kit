const framePlate = box(120, 60, 3).translate(60, 0, 0);
const doorPlate = box(100, 60, 3).translate(50, 0, 0);

// Add a small hinge barrel on each part, offset so the door can rotate without collision.
const frameKnuckle = cylinder(3, 4, 4, 24, true).rotate(90, 0, 0).translate(0, 0, 1.5);
const doorKnuckle = cylinder(3, 4, 4, 24, true).rotate(90, 0, 0).translate(0, 0, 1.5);

const frame = union(framePlate, frameKnuckle);
const door = union(doorPlate, doorKnuckle).translate(-10, 0, 0);

const asm = assembly("DoorHinge");
asm.addPart("Frame", frame, { fixed: true });
asm.addPart("Door", door, {});

asm.addRevolute("hinge", "Frame", "Door", {
  axis: [0, 0, 1],
  min: 0,
  max: 90,
  default: 0,
  frame: Transform.identity().translate(0, 0, 0)
});

return asm;
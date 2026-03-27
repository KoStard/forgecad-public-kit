// Frame plate: vertical plate in XY plane, centered at origin
const frame = box(80, 80, 8)
  .color("#888888");

// Door plate: attached at right edge of frame (x=40), hinge along Z axis
const door = box(8, 70, 80)
  .translate(44, 0, 0)
  .color("#6666AA");

// Create assembly with frame and door parts
const mech = assembly("DoorHinge")
  .addPart("Frame", frame)
  .addPart("Door", door)
  .addRevolute("hinge", "Frame", "Door", {
    axis: [0, 0, 1],
    min: 0,
    max: 90,
    default: 0,
    frame: Transform.identity().translate(40, 0, 0)
  });

// Verify functional requirements
verify.that("frame_height", () => frame.boundingBox().max[2] - frame.boundingBox().min[2] >= 40, "Frame height >= 40mm");
verify.that("door_length", () => door.boundingBox().max[1] - door.boundingBox().min[1] >= 40, "Door length >= 40mm");

// Sweep and check for collisions
const solved = mech.sweepJoint("hinge", 0, 90, 10);
const collisions = solved.collisionReport();
verify.that("no_collisions", () => collisions.length === 0, "No collisions during sweep");

return solved;
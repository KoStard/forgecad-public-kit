// Door Hinge Assembly

// Frame plate: 80mm x 60mm x 6mm rectangular plate
const framePlate = box(80, 60, 6, false)
  .translate(40, 30, 0)
  .color("#888888");

// Door plate: 100mm x 60mm x 6mm rectangular plate
const doorPlate = box(100, 60, 6, false)
  .translate(-50, 30, 0)
  .color("#4466aa");

// Hinge pin: small cylinder along Z-axis at the joint location
const hingePin = cylinder(6, 4, 4, 16, false)
  .translate(0, 30, 0)
  .color("#555555");

// Create assembly
const asm = assembly("DoorHinge")
  .addPart("Frame", framePlate)
  .addPart("Door", doorPlate)
  .addPart("HingePin", hingePin)
  .addRevolute("hinge", "Frame", "Door", {
    axis: [0, 0, 1],
    min: 0,
    max: 90,
    default: 0,
    frame: Transform.identity().translate(0, 30, 0)
  });

return asm;
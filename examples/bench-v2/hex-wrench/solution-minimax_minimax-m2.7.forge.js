// Open-end hex wrench for M10 bolts (17mm across-flats)
// Creates a C-shaped jaw with hexagonal gripping geometry

// Main body: handle + jaw section
const body = box(110, 28, 8, false).translate(0, 0, 0);

// Jaw opening position (15mm from front edge)
const jawX = 0;
const jawY = 15;
const jawRadius = 10;
const jawOffset = 10.25;  // Distance for 17.5mm flat-to-flat with clearance

// Three cylinders forming the hexagonal socket opening
// Two side cylinders + center cylinder create flat regions
const cyl1 = cylinder(30, jawRadius).translate(jawX, jawY, 0);
const cyl2 = cylinder(30, jawRadius).translate(jawOffset, jawY, 0);
const cyl3 = cylinder(30, jawRadius).translate(-jawOffset, jawY, 0);

// Subtract cylinders from body to create open jaw
const wrench = difference(body, cyl1, cyl2, cyl3);

return wrench;
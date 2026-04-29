// Patterns — linearPattern and circularPattern for repeating shapes.

const count = Param.number("Count", 6, { min: 2, max: 12, integer: true });
const spacing = Param.number("Spacing", 20, { min: 10, max: 40, unit: "mm" });
const radius = Param.number("Ring Radius", 40, { min: 20, max: 80, unit: "mm" });

// --- linearPattern: repeat along a direction ---
const peg = cylinder(15, 4).color('#4488cc');
const row = linearPattern(peg, count, spacing, 0);

// --- circularPattern: repeat around Z axis ---
const hole = cylinder(8, 3).translate(radius, 0, 0).color('#cc4444');
const ring = circularPattern(hole, count);

// --- mirrorCopy: mirror + union with original ---
const halfBracket = box(40, 10, 20).color('#44cc88');
const fullBracket = mirrorCopy(halfBracket, [1, 0, 0]).translate(0, 0, 40);

// Show a base plate with the circular holes subtracted
const plate = cylinder(10, radius + 15).color('#888888').translate(0, 80, 0);
const holeRing = circularPattern(
  cylinder(12, 3).translate(radius, 0, -1),
  count
).translate(0, 80, 0);
const drilled = plate.subtract(holeRing);

return [
  { name: "Linear Pattern", shape: row },
  { name: "Circular Pattern", shape: ring },
  { name: "Mirror Copy", shape: fullBracket },
  { name: "Drilled Plate", shape: drilled },
];

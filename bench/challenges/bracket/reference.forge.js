// Reference: L-bracket with two bolt holes
const plateW = 40;
const plateH = 30;
const thickness = 5;
const holeD = 6.5; // M6 clearance

// Vertical plate (XZ plane)
const vertical = box(plateW, thickness, plateH);

// Horizontal plate (XY plane)
const horizontal = box(plateW, plateH, thickness);

// Join into L-shape
const lShape = union(vertical, horizontal);

// Hole in vertical plate (through Y axis)
const hole1 = cylinder(thickness + 2, holeD / 2)
  .rotate(90, 0, 0)
  .translate(plateW / 2, thickness / 2, plateH / 2);

// Hole in horizontal plate (through Z axis)
const hole2 = cylinder(thickness + 2, holeD / 2)
  .translate(plateW / 2, plateH / 2, thickness / 2);

return lShape.subtract(hole1).subtract(hole2);

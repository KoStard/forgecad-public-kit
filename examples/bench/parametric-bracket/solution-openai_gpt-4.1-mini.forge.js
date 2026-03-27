const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });

const clearance = 0.5;
const holeDiam = boltDiam + clearance;
const thickness = Math.max(2 * boltDiam, 6);
const plateWidth = Math.max(3 * boltDiam, 15);
const plateHeight = Math.max(3 * boltDiam, 15);
const plateDepth = thickness;

// Create vertical plate centered at origin
const verticalPlate = box(thickness, plateWidth, plateHeight, true);

// Create horizontal plate, rotate and position to form L
const horizontalPlate = box(plateWidth, thickness, plateHeight, true)
  .translate((plateWidth + thickness) / 2, 0, -(plateHeight - thickness) / 2);

// Union plates to form L bracket
let bracket = union(verticalPlate, horizontalPlate);

// Create holes for bolts
// Hole in vertical plate: centered in plate face, offset from edges
const holeVertical = cylinder(plateHeight + 2, holeDiam / 2, null, 32, true)
  .translate(0, 0, 0);

// Hole in horizontal plate: centered in plate face
const holeHorizontal = cylinder(plateWidth + 2, holeDiam / 2, null, 32, true)
  .rotate(90, 0, 0)
  .translate((plateWidth + thickness) / 2, 0, -(plateHeight - thickness) / 2);

// Subtract holes from bracket
bracket = difference(bracket, holeVertical, holeHorizontal);

return bracket;
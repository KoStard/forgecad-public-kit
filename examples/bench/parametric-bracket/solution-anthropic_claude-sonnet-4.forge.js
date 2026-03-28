const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });

const wallThickness = boltDiam * 2;
const plateSize = boltDiam * 3;
const holeDiam = boltDiam + 0.5;

// Create the two plates
const verticalPlate = box(wallThickness, plateSize, plateSize, false);
const horizontalPlate = box(plateSize, wallThickness, plateSize, false);

// Position the horizontal plate to form an L-shape
const horizontalPlatePositioned = horizontalPlate.translate(0, 0, 0);

// Create the L-shaped bracket by unioning the plates
const bracket = union(verticalPlate, horizontalPlatePositioned);

// Create mounting holes
const verticalHole = cylinder(wallThickness + 1, holeDiam / 2, undefined, 16, false)
  .rotate(90, 0, 0)
  .translate(-0.5, plateSize / 2, plateSize / 2);

const horizontalHole = cylinder(wallThickness + 1, holeDiam / 2, undefined, 16, false)
  .rotate(0, 90, 0)
  .translate(plateSize / 2, -0.5, plateSize / 2);

// Subtract the holes from the bracket
const finalBracket = difference(bracket, verticalHole, horizontalHole);

return finalBracket;
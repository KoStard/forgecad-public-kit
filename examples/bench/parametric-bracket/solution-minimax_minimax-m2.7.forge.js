const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });

// Dimensions based on bolt diameter requirements
const t = 2 * boltDiam;      // Wall thickness (≥2x bolt diameter)
const w = 3 * boltDiam;      // Plate width (≥3x bolt diameter)
const l = 5 * boltDiam;      // Arm length for each plate
const h = 5 * boltDiam;      // Bracket depth

// L-bracket: horizontal arm in XY plane + vertical arm in XZ plane
const horizontalArm = box(l, h, t);
const verticalArm = box(t, h, l);

const bracket = union(horizontalArm, verticalArm);

// Mounting holes: boltDiam + 0.5mm clearance
const holeDiameter = boltDiam + 0.5;
const holeRadius = holeDiameter / 2;

// Holes need to extend through the bracket in the Y direction
// Horizontal plate hole at end of horizontal arm
const horizontalHole = cylinder(h * 1.5, holeRadius, 32)
  .rotate(0, 90, 0)
  .translate(l, h / 2, t / 2);

// Vertical plate hole at top of vertical arm
const verticalHole = cylinder(h * 1.5, holeRadius, 32)
  .rotate(0, 90, 0)
  .translate(t / 2, h / 2, l);

return difference(bracket, horizontalHole, verticalHole);
const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });

const longArmWidth = 5 * boltDiam;
const shortArmWidth = 4 * boltDiam;
const height = 4 * boltDiam;
const thickness = 2 * boltDiam;

const plate1 = box(longArmWidth, height, thickness);
const plate2 = box(shortArmWidth, height, thickness);
const lShape = union(plate1, plate2.translate([longArmWidth - thickness, 0, 0]));

const holeDiameter = boltDiam + 0.5;
const holeRadius = holeDiameter / 2;

const hole1 = cylinder(height + 1, holeRadius);
const hole2 = cylinder(height + 1, holeRadius);

const bracket = difference(
  lShape,
  hole1.translate([3 * boltDiam, 0, 0]),
  hole2.translate([2 * boltDiam, 2 * boltDiam, 0])
);

return bracket;
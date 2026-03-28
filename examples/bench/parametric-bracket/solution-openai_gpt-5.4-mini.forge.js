const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });

const clearance = 0.5;
const holeDiam = boltDiam + clearance;

// Dimensions based on bolt size
const t = 2 * boltDiam;          // wall thickness
const leg = 3 * boltDiam;        // minimum plate width/height
const extra = boltDiam;          // give some leg length beyond the minimum for a more functional bracket
const armLen = leg + extra;

// Build an L by unioning two perpendicular plates
const plateX = box(armLen, leg, t, false).translate(armLen / 2, 0, 0);
const plateY = box(leg, armLen, t, false).translate(0, armLen / 2, 0);

let bracket = union(plateX, plateY);

// Add mounting holes: one in each plate, centered in the exposed region of each leg
const holeDepth = t * 2;
const hole1 = cylinder(holeDepth, holeDiam / 2, holeDiam / 2, 48, true)
  .rotate(90, 0, 0)
  .translate(armLen * 0.65, leg / 2, 0);

const hole2 = cylinder(holeDepth, holeDiam / 2, holeDiam / 2, 48, true)
  .rotate(0, 90, 0)
  .translate(leg / 2, armLen * 0.65, 0);

bracket = difference(bracket, hole1, hole2);

return bracket;
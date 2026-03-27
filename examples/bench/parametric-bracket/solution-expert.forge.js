// Expert solution: Parametric L-bracket

const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });

const t = boltDiam * 2;        // wall thickness
const w = boltDiam * 3.5;      // plate width/height
const d = boltDiam * 3;        // plate depth (into Y)

// L-shape: horizontal plate on XY, vertical plate on XZ
const horizPlate = box(w, d, t);
const vertPlate = box(t, d, w).translate(0, 0, 0);

const lShape = union(horizPlate, vertPlate);

// Mounting holes (boltDiam + 0.5mm clearance), through Y axis
const holeR = (boltDiam + 0.5) / 2;
const horizHole = cylinder(d + 2, holeR).rotate(90, 0, 0).translate(w * 0.6, d / 2, t / 2);
const vertHole = cylinder(d + 2, holeR).rotate(90, 0, 0).translate(t / 2, d / 2, w * 0.6);

return difference(lShape, horizHole, vertHole);

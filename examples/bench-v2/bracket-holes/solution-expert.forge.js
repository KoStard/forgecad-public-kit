// Expert: L-bracket with M6 through-holes
const plateW = 40;
const plateH = 30;
const t = 5;
const holeR = 6.5 / 2;

// Horizontal plate (on XY plane)
const horizPlate = box(plateW, plateH, t);
// Vertical plate (on XZ plane)
const vertPlate = box(t, plateH, plateW);

const lShape = union(horizPlate, vertPlate);

// Through-hole in horizontal plate (through Z)
const holeH = cylinder(t + 4, holeR).translate(plateW * 0.6, plateH / 2, t / 2);
// Through-hole in vertical plate (through X)
const holeV = cylinder(t + 4, holeR).rotate(0, 90, 0).translate(t / 2, plateH / 2, plateW * 0.6);

return difference(lShape, holeH, holeV);

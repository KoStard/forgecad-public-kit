// Bolt Pattern — circularPattern + linearPattern demo

const baseR = param("Base Radius", 40, { min: 20, max: 80, unit: "mm" });
const baseH = param("Base Height", 10, { min: 5, max: 20, unit: "mm" });
const boltR = param("Bolt Radius", 3, { min: 1, max: 6, unit: "mm" });
const boltCount = param("Bolt Count", 6, { min: 3, max: 12 });
const boltCircleR = param("Bolt Circle", 30, { min: 15, max: 70, unit: "mm" });

// Base plate
const base = circle2d(baseR).extrude(baseH);

// Single bolt hole
const hole = circle2d(boltR).extrude(baseH + 2).translate(boltCircleR, 0, -1);

// Circular pattern of holes
const holes = circularPattern(hole, boltCount);

return base.subtract(holes);

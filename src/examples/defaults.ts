export const EXAMPLE_PHONE_STAND = `// ForgeCAD — Phone Stand
// Every param() call creates a live slider in the UI.

const width = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const depth = param("Depth", 60, { min: 30, max: 100, unit: "mm" });
const thick = param("Thickness", 5, { min: 2, max: 15, unit: "mm" });
const backH = param("Back Height", 40, { min: 20, max: 80, unit: "mm" });

// Base plate
const base = box(width, depth, thick);

// Back support
const back = box(width, thick, backH)
  .translate(0, depth - thick, thick);

// Phone lip
const lip = box(width, 10, 8)
  .translate(0, 0, thick);

// Cable hole
const hole = cylinder(thick + 2, 8)
  .rotate(90, 0, 0)
  .translate(width / 2, depth / 2, 0);

return union(base, back, lip).subtract(hole);
`;

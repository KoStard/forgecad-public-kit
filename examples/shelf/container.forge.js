// Storage Container — parametric open-top bin
// Used by shelf-unit.forge.js via importPart()

const w = param("Container Width", 120, { min: 60, max: 200, unit: "mm" });
const d = param("Container Depth", 180, { min: 100, max: 300, unit: "mm" });
const h = param("Container Height", 100, { min: 50, max: 200, unit: "mm" });
const wall = param("Wall", 3, { min: 1.5, max: 6, unit: "mm" });
const lipH = param("Lip Height", 5, { min: 2, max: 10, unit: "mm" });

// Outer shell
const outer = box(w, d, h);

// Inner cavity (open top)
const inner = box(w - wall * 2, d - wall * 2, h - wall + 1)
  .translate(wall, wall, wall);

// Lip — slight outward flange at top for grip
const lip = box(w + lipH * 2, d + lipH * 2, wall)
  .translate(-lipH, -lipH, h - wall);

const container = union(outer, lip).subtract(inner);

// Label area — shallow recess on front face
const labelW = w * 0.6;
const labelH = h * 0.3;
const labelDepth = 0.8;
const label = box(labelW, labelDepth + 1, labelH)
  .translate(w / 2 - labelW / 2, -0.5, h * 0.35);

return container.subtract(label);

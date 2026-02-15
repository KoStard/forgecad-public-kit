const w = param("Width", 30, { min: 10, max: 80, unit: "mm" });
const h = param("Height", 20, { min: 10, max: 80, unit: "mm" });
const d = param("Depth", 10, { min: 4, max: 40, unit: "mm" });

return box(w, d, h, true);

// Dimensioned L-bracket — shows how to add dimension annotations

const w = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const h = param("Height", 60, { min: 30, max: 100, unit: "mm" });
const d = param("Depth", 40, { min: 20, max: 80, unit: "mm" });
const t = param("Thickness", 5, { min: 2, max: 15, unit: "mm" });

// Build the L-bracket
const base = box(w, d, t);
const wall = box(t, d, h).translate(0, 0, t);
const bracket = union(base, wall);

// Add dimensions — purely visual annotations
dim([0, 0, 0], [w, 0, 0], { label: "Width" });
dim([0, 0, 0], [0, d, 0], { label: "Depth", offset: 12 });
dim([0, 0, 0], [0, 0, h + t], { label: "Height", offset: 15 });
dim([0, 0, 0], [t, 0, 0], { label: "Wall", offset: -8, color: "#ffaa44" });

return bracket;

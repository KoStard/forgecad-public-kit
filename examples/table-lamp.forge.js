// Table Lamp — base + stem + shade (multi-file: imports shade profile)

const baseR = param("Base Radius", 25, { min: 15, max: 40, unit: "mm" });
const baseH = param("Base Height", 6, { min: 3, max: 12, unit: "mm" });
const stemR = param("Stem Radius", 4, { min: 2, max: 8, unit: "mm" });
const stemH = param("Stem Height", 60, { min: 30, max: 100, unit: "mm" });

// --- Base: flat cylinder ---
const base = cylinder(baseH, baseR);

// --- Stem: thin cylinder rising from base center ---
const stem = cylinder(stemH, stemR).translate(0, 0, baseH);

// --- Shade: revolve the imported profile ---
const shadeProfile = importSketch("lamp-shade.sketch.js");
const shade = shadeProfile.revolve();
const shadeZ = baseH + stemH;
const shadePlaced = shade.translate(0, 0, shadeZ);

return [
  { name: "Base", shape: base, color: "#2a2a2a" },
  { name: "Stem", shape: stem, color: "#888888" },
  { name: "Shade", shape: shadePlaced, color: "#f5e6c8" },
];

// Table Lamp — base + stem + shade (multi-file: imports shade profile)

const baseR = Param.number("Base Radius", 25, { min: 15, max: 40, unit: "mm" });
const baseH = Param.number("Base Height", 6, { min: 3, max: 12, unit: "mm" });
const stemR = Param.number("Stem Radius", 4, { min: 2, max: 8, unit: "mm" });
const stemH = Param.number("Stem Height", 60, { min: 30, max: 100, unit: "mm" });
const shadeTopR = Param.number("Shade Top Radius", 15, { min: 8, max: 30, unit: "mm" });
const shadeBottomR = Param.number("Shade Bottom Radius", 30, { min: 15, max: 50, unit: "mm" });
const shadeH = Param.number("Shade Height", 35, { min: 20, max: 60, unit: "mm" });
const shadeWall = Param.number("Shade Wall", 1.5, { min: 0.5, max: 4, unit: "mm" });

// --- Base: flat cylinder ---
const base = cylinder(baseH, baseR);

// --- Stem: thin cylinder rising from base center ---
const stem = cylinder(stemH, stemR).translate(0, 0, baseH);

// Outer trapezoid profile (right half for revolution around Y axis)
const shadeProfile = polygon([
  [shadeTopR, shadeH],
  [shadeBottomR, 0],
  [shadeBottomR, -shadeWall],      // bottom lip thickness
  [shadeTopR - shadeWall, shadeH], // inner top
]);

const shade = shadeProfile.revolve();
const shadeZ = baseH + stemH;
const shadePlaced = shade.translate(0, 0, shadeZ);

return [
  { name: "Base", shape: base, color: "#2a2a2a" },
  { name: "Stem", shape: stem, color: "#888888" },
  { name: "Shade", shape: shadePlaced, color: "#f5e6c8" },
];

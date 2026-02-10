// Foldable iPhone Stand — two-piece with hinge
// A base plate and a back support that folds flat for travel.

const standW = param("Stand Width", 85, { min: 70, max: 120, unit: "mm" });
const thick = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const baseLen = param("Base Length", 80, { min: 50, max: 120, unit: "mm" });
const backH = param("Back Height", 70, { min: 40, max: 120, unit: "mm" });
const lipH = param("Lip Height", 12, { min: 5, max: 25, unit: "mm" });
const lipAngle = param("Lip Angle", 80, { min: 60, max: 90, unit: "°" });
const foldAngle = param("Fold Angle", 65, { min: 0, max: 90, unit: "°" });
const hingeR = param("Hinge Radius", 3, { min: 2, max: 6, unit: "mm" });
const cableHoleD = param("Cable Hole", 12, { min: 0, max: 20, unit: "mm" });
const gripSlots = param("Grip Slots", 3, { min: 0, max: 5 });

// --- Base plate (centered on XY, bottom at Z=0) ---
const base = roundedRect(standW, baseLen, 3, true).extrude(thick);

// --- Front lip (holds the phone) ---
// Build at origin: sits on XZ plane, thick in Y, lipH tall in Z
// Then tilt backward, then move to front edge
const lipRaw = box(standW - 10, thick, lipH, true)
  .translate(0, 0, lipH / 2);                  // lift so bottom edge is at Z=0
const lipTilted = lipRaw.rotate(-(90 - lipAngle), 0, 0);  // tilt back
const lip = lipTilted.translate(0, -baseLen / 2, thick);   // move to front edge, on top of base

// --- Grip slots (cross-wise along X to prevent phone sliding forward) ---
const slotParts = [];
if (gripSlots > 0) {
  const slotSpacing = (baseLen * 0.5) / (gripSlots + 1);
  for (let i = 0; i < gripSlots; i++) {
    const sy = -baseLen / 4 + slotSpacing * (i + 1);
    slotParts.push(
      box(standW * 0.6, 2, thick + 2, true)
        .translate(0, sy, thick / 2)
    );
  }
}

// --- Cable hole (near front lip where phone bottom rests) ---
let baseFinal = union(base, lip);
if (slotParts.length > 0) {
  baseFinal = baseFinal.subtract(union(...slotParts));
}
if (cableHoleD > 0) {
  const cableHole = cylinder(thick + 2, cableHoleD / 2)
    .translate(0, -baseLen / 4, -1);
  baseFinal = baseFinal.subtract(cableHole);
}

// --- Back support (foldable) ---
// Build panel at origin standing up in Z, then rotate around its bottom edge, then translate to hinge
const backPanel = box(standW - 6, thick, backH, true)
  .translate(0, 0, backH / 2);                    // bottom edge at Z=0
const backRotated = backPanel
  .rotate(-foldAngle, 0, 0)                        // fold: 0°=vertical, 90°=flat
  .translate(0, baseLen / 2, thick);               // move to back edge of base

// --- Hinge cylinders (decorative pivots along X axis) ---
const hingeLen = 10;
const hingeLeft = cylinder(hingeLen, hingeR, hingeR, 24)
  .rotate(0, 90, 0)
  .translate(-standW / 2 + 8, baseLen / 2, thick);
const hingeRight = cylinder(hingeLen, hingeR, hingeR, 24)
  .rotate(0, 90, 0)
  .translate(standW / 2 - 8 - hingeLen, baseLen / 2, thick);

return [
  { name: "Base", shape: baseFinal, color: "#556677" },
  { name: "Back Support", shape: backRotated, color: "#778899" },
  { name: "Hinge L", shape: hingeLeft, color: "#aabbcc" },
  { name: "Hinge R", shape: hingeRight, color: "#aabbcc" },
];

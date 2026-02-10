// Foldable iPhone Stand — two-piece with hinge
// A base plate and a back support that folds flat for travel.

const phoneW = param("Phone Width", 75, { min: 60, max: 90, unit: "mm" });
const phoneD = param("Phone Depth", 10, { min: 6, max: 15, unit: "mm" });
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

// --- Base plate ---
const baseProfile = roundedRect(standW, baseLen, 3, true);
const base = baseProfile.extrude(thick);

// Front lip to hold the phone — angled slightly back
const lip = box(standW - 10, thick, lipH)
  .translate(-(standW - 10) / 2, -baseLen / 2, thick)
  .rotate(90 - lipAngle, 0, 0);

// Grip slots on the base (so phone doesn't slide)
const slotParts = [];
if (gripSlots > 0) {
  const slotW = (standW - 20) / (gripSlots * 2 + 1);
  for (let i = 0; i < gripSlots; i++) {
    const sx = -(standW - 20) / 2 + slotW * (2 * i + 1);
    slotParts.push(
      box(slotW, baseLen * 0.6, thick + 1)
        .translate(sx, -baseLen * 0.3, -0.5)
    );
  }
}

// Cable hole in the base
let baseFinal = union(base, lip);
if (slotParts.length > 0) {
  baseFinal = baseFinal.subtract(union(...slotParts));
}
if (cableHoleD > 0) {
  const cableHole = cylinder(thick + 2, cableHoleD / 2)
    .translate(0, baseLen / 4, -1);
  baseFinal = baseFinal.subtract(cableHole);
}

// --- Back support (foldable) ---
// Hinge axis sits at the back edge of the base
const hingeY = baseLen / 2;
const hingeZ = thick;

// Back panel
const backPanel = box(standW - 6, thick, backH)
  .translate(-(standW - 6) / 2, 0, 0);

// Rotate around hinge point
const backRotated = backPanel
  .translate(0, hingeY, hingeZ)
  .rotate(-foldAngle, 0, 0);

// Hinge cylinders (decorative, show the pivot)
const hingeLeft = cylinder(thick * 2, hingeR, undefined, 24)
  .rotate(0, 90, 0)
  .translate(-standW / 2 + 5, hingeY, hingeZ);
const hingeRight = cylinder(thick * 2, hingeR, undefined, 24)
  .rotate(0, 90, 0)
  .translate(standW / 2 - 5 - thick * 2, hingeY, hingeZ);

return [
  { name: "Base", shape: baseFinal, color: "#556677" },
  { name: "Back Support", shape: backRotated, color: "#778899" },
  { name: "Hinge L", shape: hingeLeft, color: "#aabbcc" },
  { name: "Hinge R", shape: hingeRight, color: "#aabbcc" },
];

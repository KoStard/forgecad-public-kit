// Iron Man Helmet - Parametric Design

// Parameters
const scale = param("Scale", 1.0, { min: 0.5, max: 1.5, step: 0.1 });
const chinWidth = param("Chin Width", 80, { min: 60, max: 100, unit: "mm" });
const eyeWidth = param("Eye Width", 35, { min: 25, max: 50, unit: "mm" });
const eyeHeight = param("Eye Height", 12, { min: 8, max: 20, unit: "mm" });
const mouthWidth = param("Mouth Width", 25, { min: 15, max: 40, unit: "mm" });

// Base dimensions (scaled)
const baseWidth = 180 * scale;
const baseHeight = 240 * scale;
const baseDepth = 200 * scale;

// Main helmet shell - elongated sphere for head shape
const mainShell = sphere(baseWidth / 2)
  .scale([1, 1.3, 1.1])
  .translate(0, 0, baseHeight / 3);

// Faceplate - angular front section
const faceplateProfile = polygon([
  [0, 0],
  [chinWidth / 2, 0],
  [baseWidth / 2, baseHeight * 0.4],
  [baseWidth / 2, baseHeight * 0.7],
  [baseWidth / 2 - 20, baseHeight * 0.85],
  [0, baseHeight * 0.9]
]);

const faceplate = union2d(
  faceplateProfile,
  faceplateProfile.mirror([1, 0])
).extrude(baseDepth / 2, { scaleTop: 0.7 });

// Eye cutouts - angular slits
const eyeLeft = rect(eyeWidth, eyeHeight)
  .offset(2, 'Round')
  .extrude(50)
  .rotate(0, 10, -15)
  .translate(-baseWidth / 4, baseHeight * 0.55, baseDepth / 2 - 10);

const eyeRight = eyeLeft.mirror([1, 0, 0]);

// Mouth/chin vent - triangular opening
const mouthVent = polygon([
  [-mouthWidth / 2, 0],
  [mouthWidth / 2, 0],
  [0, -15]
]).extrude(30)
  .translate(0, baseHeight * 0.15, baseDepth / 2 - 5);

// Forehead arc reactor glow slot
const foreheadSlot = rect(40, 8)
  .offset(2, 'Round')
  .extrude(20)
  .translate(0, baseHeight * 0.75, baseDepth / 2 - 5);

// Cheek vents - angular cuts
const cheekVent = rect(15, 40)
  .extrude(25)
  .rotate(0, 15, 20)
  .translate(baseWidth / 3, baseHeight * 0.35, baseDepth / 2 - 10);

const cheekVentRight = cheekVent.mirror([1, 0, 0]);

// Combine everything
const helmet = intersection(mainShell, faceplate)
  .subtract(eyeLeft)
  .subtract(eyeRight)
  .subtract(mouthVent)
  .subtract(foreheadSlot)
  .subtract(cheekVent)
  .subtract(cheekVentRight);

// Add chin detail - angular jaw line
const chinDetail = box(chinWidth - 10, 15, 20, true)
  .translate(0, baseHeight * 0.08, baseDepth / 2 - 10);

return helmet.add(chinDetail);

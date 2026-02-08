// ForgeCAD — Iron Man Helmet
// Parametric helmet built from boolean operations on scaled spheres

const size = param("Size", 100, { min: 60, max: 150, unit: "mm" });
const wall = param("Wall", 4, { min: 2, max: 10, unit: "mm" });
const faceOpen = param("Face Opening", 0.55, { min: 0.3, max: 0.8 });
const eyeWidth = param("Eye Width", 28, { min: 15, max: 45, unit: "mm" });
const eyeHeight = param("Eye Height", 10, { min: 5, max: 20, unit: "mm" });
const eyeAngle = param("Eye Angle", 15, { min: 0, max: 35, unit: "°" });
const jawWidth = param("Jaw Width", 0.7, { min: 0.5, max: 0.9 });

const r = size / 2;

// Main helmet shell — egg shape (taller than wide, narrower front-to-back)
const outer = sphere(r).scale([1, 0.85, 1.15]);
const inner = sphere(r - wall).scale([1, 0.85, 1.15]);
let helmet = outer.subtract(inner);

// Cut bottom flat so it sits on a surface
const bottomCut = box(size * 2, size * 2, size, true).translate(0, 0, -r * 0.75);
helmet = helmet.subtract(bottomCut);

// Face plate opening — angled cut from the front
const faceCutH = size * faceOpen;
const faceCutW = size * jawWidth;
const faceCutter = box(faceCutW, size, faceCutH, true)
  .translate(0, -r * 0.6, -r * 0.1);
helmet = helmet.subtract(faceCutter);

// Chin / jaw shape — add back a narrower chin piece
const chinW = faceCutW * 0.85;
const chinH = faceCutH * 0.35;
const chinOuter = sphere(r * 0.9).scale([chinW / size, 0.85, 0.5]);
const chinInner = sphere(r * 0.9 - wall).scale([chinW / size, 0.85, 0.5]);
const chin = chinOuter.subtract(chinInner)
  .translate(0, -r * 0.15, -r * 0.45);
helmet = helmet.add(chin);

// Eye slits — two angled rectangular cuts
const eyeR = box(eyeWidth, size * 0.4, eyeHeight, true)
  .rotate(0, 0, -eyeAngle)
  .translate(eyeWidth * 0.45, -r * 0.7, r * 0.15);
const eyeL = box(eyeWidth, size * 0.4, eyeHeight, true)
  .rotate(0, 0, eyeAngle)
  .translate(-eyeWidth * 0.45, -r * 0.7, r * 0.15);
helmet = helmet.subtract(eyeR).subtract(eyeL);

// Mouth slit — narrow horizontal slot
const mouthW = faceCutW * 0.5;
const mouthSlit = box(mouthW, size * 0.4, 3, true)
  .translate(0, -r * 0.7, -r * 0.15);
helmet = helmet.subtract(mouthSlit);

// Forehead ridge — subtle raised line down the center
const ridge = box(3, r * 0.6, wall * 0.5, true)
  .translate(0, -r * 0.3, r * 0.65);
helmet = helmet.add(ridge);

return helmet;

// ForgeCAD — Iron Man Helmet v6
// Clean approach: shell + single elliptical face cut + details

const size = param("Size", 110, { min: 70, max: 160, unit: "mm" });
const wall = param("Wall", 4, { min: 2, max: 8, unit: "mm" });
const eyeW = param("Eye Width", 26, { min: 10, max: 40, unit: "mm" });
const eyeH = param("Eye Height", 8, { min: 3, max: 16, unit: "mm" });
const eyeTilt = param("Eye Tilt", 18, { min: 0, max: 35, unit: "°" });
const eyeGap = param("Eye Gap", 10, { min: 4, max: 25, unit: "mm" });

const r = size / 2;

// --- Main shell: egg shape ---
const outer = sphere(r).scale([1, 0.85, 1.15]);
const inner = sphere(r - wall).scale([1, 0.85, 1.15]);
let helmet = outer.subtract(inner);

// --- Neck cut ---
const neckZ = -r * 0.38;
helmet = helmet.subtract(
  box(size * 3, size * 3, size * 3, true).translate(0, 0, neckZ - size * 1.5)
);

// --- Face opening: egg-shaped hole ---
// Use an ellipse sketch extruded into the face
// Wider at top (brow), narrower at bottom (chin)
const faceW = r * 0.42;   // half-width at widest
const faceH = r * 0.65;   // half-height of opening
const faceZ = r * 0.0;    // center of face opening

// Egg-shaped profile: ellipse shifted so top is wider than bottom
const facePts = [];
const faceSegs = 48;
for (let i = 0; i < faceSegs; i++) {
  const a = (2 * Math.PI * i) / faceSegs;
  const z = Math.sin(a) * faceH;
  // Width varies: wider at top, narrower at bottom
  const widthFactor = 1 + 0.3 * Math.sin(a);  // wider when sin>0 (top half)
  const x = Math.cos(a) * faceW * widthFactor;
  facePts.push([x, z + faceZ]);
}
const faceShape = polygon(facePts);
const faceCutter = faceShape.extrude(r)
  .rotate(90, 0, 0)
  .translate(0, -r, 0);

helmet = helmet.subtract(faceCutter);

// --- Horizontal divider bar (separates upper face from jaw) ---
// This is the signature Iron Man face plate line
const dividerZ = -r * 0.08;
const dividerW = faceW * 2.2;
const divider = box(dividerW, r * 0.5, wall * 0.8, true)
  .translate(0, -r * 0.55, dividerZ);
// Clip to shell surface
const clipShell = sphere(r + wall * 0.3).scale([1, 0.85, 1.15]);
helmet = helmet.add(divider.intersect(clipShell));

// --- Eye slits ---
// Cut through the shell ABOVE the face opening
const eyeZ = r * 0.22;
const eyeD = r * 0.8;

const rEye = box(eyeW, eyeD, eyeH, true)
  .rotate(0, 0, -eyeTilt)
  .translate(eyeGap / 2 + eyeW / 2, -r * 0.3, eyeZ);
const lEye = box(eyeW, eyeD, eyeH, true)
  .rotate(0, 0, eyeTilt)
  .translate(-(eyeGap / 2 + eyeW / 2), -r * 0.3, eyeZ);
helmet = helmet.subtract(rEye).subtract(lEye);

// --- Mouth slits ---
const mouthZ = dividerZ - r * 0.12;
const mouthW = faceW * 1.2;
for (let i = 0; i < 4; i++) {
  const w = mouthW * (1 - i * 0.08);
  helmet = helmet.subtract(
    box(w, eyeD, 1.5, true).translate(0, -r * 0.3, mouthZ - i * 4)
  );
}

// --- Forehead ridge ---
const ridgeBlock = box(2, r * 0.25, r * 0.4, true)
  .translate(0, -r * 0.6, r * 0.65);
helmet = helmet.add(ridgeBlock.intersect(clipShell));

return helmet;

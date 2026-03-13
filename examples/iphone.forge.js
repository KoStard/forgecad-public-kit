// iPhone — parametric model
// Tests ForgeCAD's sketch→extrude + smoothing workflow

// === Dimensions (roughly iPhone 15 Pro proportions) ===
const w = param("Width", 71.6, { min: 60, max: 80, unit: "mm" });
const h = param("Height", 146.6, { min: 120, max: 170, unit: "mm" });
const d = param("Depth", 8.25, { min: 6, max: 12, unit: "mm" });
const cornerR = param("Corner Radius", 10, { min: 2, max: 20, unit: "mm" });
const edgeR = param("Edge Radius", 1.5, { min: 0, max: 3, step: 0.1, unit: "mm" });

// === Body ===
// Strategy: create the body profile, extrude, then smooth edges.
// smoothOut + refine rounds the sharp 90° edges where top/bottom meet sides.
// We use low smoothness to avoid inflating the shape.
const bodyProfile = roundedRect(w, h, cornerR, true);
let body = bodyProfile.extrude(d, { center: true });

if (edgeR > 0) {
  // smoothOut marks edges for rounding, refine subdivides to actually curve them
  // minSharpAngle=80 catches the 90° edges but leaves shallow angles alone
  // minSmoothness controls how much rounding (0=sharp, 1=full round)
  const smoothness = Math.min(edgeR / 3, 1);
  body = body.toShape().smoothOut(80, smoothness).refine(3);
}

// === Screen cutout (inset from front face) ===
const screenInset = param("Screen Inset", 2, { min: 1, max: 5, unit: "mm" });
const screenDepth = 0.4;
const screenProfile = roundedRect(w - screenInset * 2, h - screenInset * 2, cornerR - screenInset, true);
const screenCut = screenProfile.extrude(screenDepth + 1)
  .translate(0, 0, d / 2 - screenDepth);
body = body.subtract(screenCut);

// === Camera island (back, top-left area) ===
const camSize = param("Camera Island", 36, { min: 25, max: 45, unit: "mm" });
const camR = 8;
const camBump = param("Camera Bump", 1.5, { min: 0.5, max: 3, unit: "mm" });
const camX = -w / 2 + camSize / 2 + 4;
const camY = h / 2 - camSize / 2 - 4;

const camProfile = roundedRect(camSize, camSize, camR, true).translate(camX, camY);
let camIsland = camProfile.extrude(camBump).translate(0, 0, -d / 2 - camBump);
if (edgeR > 0) {
  camIsland = camIsland.toShape().smoothOut(80, 0.4).refine(2);
}

// Camera lenses (3 in L-pattern)
const lensR = param("Lens Radius", 6, { min: 3, max: 10, unit: "mm" });
const lensSpacing = 12;
const lensZ = -d / 2 - camBump;

const makeLens = (x, y) =>
  circle2d(lensR).translate(x, y).extrude(camBump + 1).translate(0, 0, lensZ - 0.5);

const lens1 = makeLens(camX - lensSpacing / 2, camY + lensSpacing / 2);
const lens2 = makeLens(camX + lensSpacing / 2, camY + lensSpacing / 2);
const lens3 = makeLens(camX - lensSpacing / 2, camY - lensSpacing / 2);

// === Charging port (bottom edge) ===
const portW = param("Port Width", 9, { min: 6, max: 14, unit: "mm" });
const portH = 3;
const portDepth = 4;
const portCut = roundedRect(portW, portH, portH / 2, true)
  .extrude(portDepth)
  .rotate(90, 0, 0)
  .translate(0, -h / 2, 0);

// === Speaker grille (bottom, right of port) ===
const holeR = 0.5;
const holeCount = param("Speaker Holes", 6, { min: 3, max: 10 });
const holeSpacing = 2.2;
const grillX0 = portW / 2 + 5;
const speakerHoles = [];
for (let i = 0; i < holeCount; i++) {
  speakerHoles.push(
    cylinder(portDepth, holeR, undefined, 12)
      .rotate(90, 0, 0)
      .translate(grillX0 + i * holeSpacing, -h / 2, 0)
  );
}

// Mic holes (bottom, left of port)
for (let i = 0; i < 2; i++) {
  speakerHoles.push(
    cylinder(portDepth, holeR, undefined, 12)
      .rotate(90, 0, 0)
      .translate(-grillX0 - i * holeSpacing, -h / 2, 0)
  );
}
const grillCut = union(...speakerHoles);

// === Side buttons ===
const btnInset = 0.4;
const btnThick = 1.6;

const sideBtn = (bw, bx, by, side) => {
  const profile = roundedRect(bw, btnThick, 0.5, true);
  const btn = profile.extrude(btnInset);
  if (side === 'left') return btn.rotate(90, 0, 90).translate(-w / 2 - edgeR - btnInset, by, 0);
  return btn.rotate(90, 0, 90).translate(w / 2 + edgeR + btnInset, by, 0);
};

const volUp = sideBtn(14, 0, h / 2 - 35, 'left');
const volDown = sideBtn(14, 0, h / 2 - 53, 'left');
const actionBtn = sideBtn(8, 0, h / 2 - 13, 'left');
const powerBtn = sideBtn(18, 0, h / 2 - 40, 'right');

// === Assembly ===
let phone = union(body, camIsland);
phone = phone.subtract(lens1).subtract(lens2).subtract(lens3);
phone = phone.subtract(portCut).subtract(grillCut);
phone = union(phone, volUp, volDown, actionBtn, powerBtn);

return phone;

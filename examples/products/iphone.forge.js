// iPhone — parametric model
// Tests ForgeCAD's sketch→extrude + smoothing workflow

// === Dimensions (roughly iPhone 15 Pro proportions) ===
const w = Param.number("Width", 71.6, { min: 60, max: 80, unit: "mm" });
const h = Param.number("Height", 146.6, { min: 120, max: 170, unit: "mm" });
const d = Param.number("Depth", 8.25, { min: 6, max: 12, unit: "mm" });
const cornerR = Param.number("Corner Radius", 10, { min: 2, max: 20, unit: "mm" });
const edgeR = Param.number("Edge Radius", 1.5, { min: 0, max: 3, step: 0.1, unit: "mm" });

// === Body ===
// Rounded-rect profile extruded to phone depth, then subdivision-smoothed
// to round the 90° edges where top/bottom meet sides.
const bodyProfile = roundedRect(w, h, cornerR);
let body = bodyProfile.extrude(d).translate(0, 0, -d / 2);

// === Screen cutout (top +Z face = phone screen side) ===
const screenInset = Param.number("Screen Inset", 2, { min: 1, max: 5, unit: "mm" });
const screenDepth = 0.4;
const screenW = w - screenInset * 2;
const screenH = h - screenInset * 2;
const screenR = Math.max(cornerR - screenInset, 1);

const screenCut = roundedRect(screenW, screenH, screenR)
  .extrude(screenDepth + 1)
  .translate(0, 0, d / 2 - screenDepth);

body = body.subtract(screenCut);

// Dark screen surface filling the cutout
const screenFill = roundedRect(screenW, screenH, screenR)
  .color('#111111')
  .extrude(0.15)
  .translate(0, 0, d / 2 - screenDepth);

// === Camera island (bottom -Z face = phone back, upper-left area) ===
const camSize = Param.number("Camera Island", 36, { min: 25, max: 45, unit: "mm" });
const camR = 8;
const camBump = Param.number("Camera Bump", 1.5, { min: 0.5, max: 3, unit: "mm" });
const camEdgeInset = 4;
const camX = -w / 2 + camSize / 2 + camEdgeInset;
const camY = h / 2 - camSize / 2 - camEdgeInset;

let camIsland = roundedRect(camSize, camSize, camR)
  .translate(camX, camY)
  .extrude(camBump)
  .translate(0, 0, -d / 2 - camBump);

// Camera lenses — 3 in L-pattern, positioned via entity geometry
const lensR = Param.number("Lens Radius", 6, { min: 3, max: 10, unit: "mm" });
const lensGap = Param.number("Lens Gap", 3, { min: 1, max: 8, unit: "mm" });

// Use Rectangle2D entity to derive lens positions from island bounds
const camRect = Rectangle2D.fromCenterAndDimensions(point(camX, camY), camSize, camSize);
const triRadius = camSize / 2 - lensR - lensGap;

// Equilateral triangle: two lenses stacked on outer (left) edge,
// third lens pointing right toward phone center
const lens1 = camRect.center.translate(-triRadius / 2, triRadius * Math.sqrt(3) / 2);
const lens2 = camRect.center.translate(-triRadius / 2, -triRadius * Math.sqrt(3) / 2);
const lens3 = camRect.center.translate(triRadius, 0);

const lensZ = -d / 2 - camBump;
const makeLens = (pt) => {
  const [lx, ly] = pt.toTuple();
  return circle2d(lensR).translate(lx, ly)
    .extrude(camBump + 1).translate(0, 0, lensZ - 0.5);
};

camIsland = camIsland.subtract(makeLens(lens1), makeLens(lens2), makeLens(lens3));

// === Charging port (front -Y face = phone bottom edge) ===
// pointAlong([0,1,0]) orients the extrusion along +Y so it cuts INTO the body
const portW = Param.number("Port Width", 9, { min: 6, max: 14, unit: "mm" });
const portH = 3;
const portDepth = 4;

const portCut = roundedRect(portW, portH, portH / 2)
  .extrude(portDepth)
  .pointAlong([0, 1, 0])
  .translate(0, -h / 2, 0);

// === Speaker & mic grille (front -Y face) ===
const holeR = 0.5;
const holeCount = Param.number("Speaker Holes", 6, { min: 3, max: 10, integer: true });
const holeSpacing = 2.2;
const grillX0 = portW / 2 + 5;

const grillHoles = [];
// Speaker holes (right of port)
for (let i = 0; i < holeCount; i++) {
  grillHoles.push(
    cylinder(portDepth, holeR, undefined, 12)
      .pointAlong([0, 1, 0])
      .translate(grillX0 + i * holeSpacing, -h / 2, 0)
  );
}
// Mic holes (left of port)
for (let i = 0; i < 2; i++) {
  grillHoles.push(
    cylinder(portDepth, holeR, undefined, 12)
      .pointAlong([0, 1, 0])
      .translate(-grillX0 - i * holeSpacing, -h / 2, 0)
  );
}

body = body.subtract(portCut, ...grillHoles);

// === Side buttons ===
const btnInset = 0.4;
const btnThick = 1.6;

const makeBtn = (bw, by, side) => {
  const btn = roundedRect(bw, btnThick, 0.5).extrude(btnInset);
  const x = side === 'left'
    ? -w / 2 - edgeR - btnInset
    : w / 2 + edgeR + btnInset;
  return btn.rotateX(90).rotateZ(90).translate(x, by, 0);
};

const volUp = makeBtn(14, h / 2 - 35, 'left');
const volDown = makeBtn(14, h / 2 - 53, 'left');
const actionBtn = makeBtn(8, h / 2 - 13, 'left');
const powerBtn = makeBtn(18, h / 2 - 40, 'right');

// === Return named objects with colors ===
return [
  { name: "Body", shape: body.color('#C4C4C6') },
  { name: "Screen", shape: screenFill },
  { name: "Camera Island", shape: camIsland.color('#3A3A3C') },
  { name: "Volume Up", shape: volUp.color('#A0A0A2') },
  { name: "Volume Down", shape: volDown.color('#A0A0A2') },
  { name: "Action Button", shape: actionBtn.color('#A0A0A2') },
  { name: "Power Button", shape: powerBtn.color('#A0A0A2') },
];

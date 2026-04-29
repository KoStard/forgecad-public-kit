// Laptop — parametric with opening hinge
// Demonstrates: joint(), multi-object, roundedRect, boolean ops

const w = Param.number("Width", 320, { min: 250, max: 400, unit: "mm" });
const d = Param.number("Depth", 220, { min: 170, max: 300, unit: "mm" });
const baseH = Param.number("Base Height", 15, { min: 8, max: 25, unit: "mm" });
const lidH = Param.number("Lid Height", 6, { min: 3, max: 12, unit: "mm" });
const cornerR = Param.number("Corner Radius", 10, { min: 3, max: 25, unit: "mm" });
const screenInset = Param.number("Screen Bezel", 8, { min: 3, max: 20, unit: "mm" });
const kbInsetX = Param.number("KB Inset X", 25, { min: 10, max: 50, unit: "mm" });
const kbInsetY = Param.number("KB Inset Y", 15, { min: 8, max: 40, unit: "mm" });

// ─── Base ───
const baseProfile = roundedRect(w, d, cornerR);
let base = baseProfile.extrude(baseH);

// Keyboard recess
const kbW = w - kbInsetX * 2;
const kbD = d * 0.55;
const kbDepth = 1.5;
const kbRecess = roundedRect(kbW, kbD, 4)
  .extrude(kbDepth + 1)
  .translate(0, d * 0.1, baseH - kbDepth);
base = base.subtract(kbRecess);

// Trackpad recess
const tpW = w * 0.3;
const tpD = d * 0.22;
const tpRecess = roundedRect(tpW, tpD, 3)
  .extrude(kbDepth + 1)
  .translate(0, -d * 0.28, baseH - kbDepth);
base = base.subtract(tpRecess);

// Key grid (simplified — rows of small boxes subtracted)
const keyW = 14;
const keyH = 14;
const keyGap = 2;
const keyStep = keyW + keyGap;
const keyCols = Math.floor(kbW / keyStep);
const keyRows = Math.floor(kbD / keyStep);
const keyStartX = -((keyCols - 1) * keyStep) / 2;
const keyStartY = d * 0.1 - ((keyRows - 1) * keyStep) / 2;

const keys = [];
for (let r = 0; r < keyRows; r++) {
  for (let c = 0; c < keyCols; c++) {
    keys.push(
      roundedRect(keyW, keyH, 1)
        .extrude(1)
        .translate(keyStartX + c * keyStep, keyStartY + r * keyStep, baseH - kbDepth - 0.5)
    );
  }
}
const keyboard = union(...keys);

// Ports — left side
const usbC1 = roundedRect(9, 3.5, 1.5).extrude(8)
  .rotateZ(90)
  .translate(-w / 2, -d * 0.1, baseH * 0.4);
const usbC2 = roundedRect(9, 3.5, 1.5).extrude(8)
  .rotateZ(90)
  .translate(-w / 2, d * 0.05, baseH * 0.4);
base = base.subtract(usbC1).subtract(usbC2);

// Headphone jack — right side
const hpJack = cylinder(8, 2)
  .rotateY(90)
  .translate(w / 2, -d * 0.1, baseH * 0.5);
base = base.subtract(hpJack);

// Vent slots on bottom
const ventSlots = [];
const ventCount = 12;
const ventW = w * 0.4;
const ventGap = 3;
for (let i = 0; i < ventCount; i++) {
  ventSlots.push(
    roundedRect(ventW, 1.5, 0.5)
      .extrude(2)
      .translate(0, -d * 0.1 + i * ventGap, -1)
  );
}
base = difference(base, ...ventSlots);

// ─── Lid ───
const lidProfile = roundedRect(w, d, cornerR);
let lid = lidProfile.extrude(lidH);

// Screen cutout (inset from inner face)
const screenW = w - screenInset * 2;
const screenD = d - screenInset * 2;
const screenCutDepth = 1;
const screenCut = roundedRect(screenW, screenD, cornerR - screenInset / 2)
  .extrude(screenCutDepth + 1)
  .translate(0, 0, -0.5);
lid = lid.subtract(screenCut);

// Camera dot (tiny cylinder on top bezel)
const cameraDot = cylinder(lidH + 2, 2)
  .translate(0, d / 2 - screenInset / 2, -1);
lid = lid.subtract(cameraDot);

// Screen panel (thin slab filling the cutout)
const screenPanel = roundedRect(screenW - 1, screenD - 1, cornerR - screenInset / 2 - 1)
  .extrude(screenCutDepth)
  .translate(0, 0, 0);

// ─── Hinge: rotate lid open ───
// Lid pivots around the back edge of the base
const hingeY = d / 2;
const hingeZ = baseH;

// Position lid at hinge point, then use joint to rotate
const lidAtHinge = lid.translate(0, -hingeY, 0)
  .rotateX(180)
  .translate(0, hingeY, hingeZ);

const screenAtHinge = screenPanel.translate(0, -hingeY, 0)
  .rotateX(180)
  .translate(0, hingeY, hingeZ);

const lidAngle = Param.number("Lid Angle", 110, { min: 0, max: 135, unit: "°" });

const openLid = lidAtHinge.rotateAroundAxis([1, 0, 0], lidAngle, [0, hingeY, hingeZ]);
const openScreen = screenAtHinge.rotateAroundAxis([1, 0, 0], lidAngle, [0, hingeY, hingeZ]);

// Hinge cylinders (cosmetic)
const hingeR = baseH * 0.35;
const hingeLen = 40;
const hingeL = cylinder(hingeLen, hingeR)
  .pointAlong([-1, 0, 0])
  .translate(-w * 0.25 + hingeLen / 2, hingeY, hingeZ);
const hingeR2 = cylinder(hingeLen, hingeR)
  .pointAlong([1, 0, 0])
  .translate(w * 0.25 - hingeLen / 2, hingeY, hingeZ);

return [
  { name: "Base", shape: base, color: "#2a2a2a" },
  { name: "Keyboard", shape: keyboard, color: "#1a1a1a" },
  { name: "Lid", shape: openLid, color: "#2a2a2a" },
  { name: "Screen", shape: openScreen, color: "#0a0a1a" },
  { name: "Hinge L", shape: hingeL, color: "#444444" },
  { name: "Hinge R", shape: hingeR2, color: "#444444" },
];

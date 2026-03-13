// Modern Flat-Screen TV
// Ultra-thin panel with bottom electronics bulge, narrow bezels,
// V-shaped stand legs, and cable management hole

const screenW = param("Screen Width", 1100, { min: 800, max: 1600, unit: "mm" });
const aspect = param("Aspect Ratio", 1.78, { min: 1.33, max: 2.35, step: 0.01 });
const bezel = param("Bezel", 6, { min: 3, max: 20, unit: "mm" });
const thinD = param("Thin Section", 8, { min: 5, max: 20, unit: "mm" });
const bulgeD = param("Bulge Depth", 35, { min: 20, max: 60, unit: "mm" });
const bulgeH = param("Bulge Height", 120, { min: 60, max: 200, unit: "mm" });
const standSpread = param("Stand Spread", 500, { min: 200, max: 800, unit: "mm" });
const standD = param("Stand Depth", 220, { min: 120, max: 350, unit: "mm" });
const standH = param("Stand Height", 40, { min: 15, max: 80, unit: "mm" });
const legW = param("Leg Width", 30, { min: 15, max: 60, unit: "mm" });

// Derived
const screenH = screenW / aspect;
const totalW = screenW + bezel * 2;
const totalH = screenH + bezel * 2;
const panelZ = standH; // panel bottom sits on stand

// --- Thin panel (upper portion) ---
const thinPanel = box(totalW, thinD, totalH, true)
  .translate(0, 0, panelZ + totalH / 2);

// --- Electronics bulge (bottom-back of panel) ---
const bulge = box(totalW * 0.7, bulgeD, bulgeH, true)
  .translate(0, -(bulgeD - thinD) / 2, panelZ + bulgeH / 2);

const panelBody = union(thinPanel, bulge);

// --- Screen (dark inset on front face) ---
const screenDepth = 1;
const screen = box(screenW, screenDepth + 1, screenH, true)
  .translate(0, thinD / 2, panelZ + totalH / 2);

const panel = panelBody.subtract(screen);

// --- Stand: two V-shaped legs ---
// Each leg is a flat slab angled outward from center
const legThick = 8;
const halfSpread = standSpread / 2;

const makeLeg = (side) => {
  // Leg runs from center-bottom of panel outward to the foot
  const footX = side * halfSpread;
  const legLen = Math.sqrt(halfSpread * halfSpread + standD * standD / 4);

  // Simple approach: a box rotated to angle from center to foot
  const angle = Math.atan2(halfSpread, standD / 2) * 180 / Math.PI;

  return box(legW, legLen, legThick, true)
    .rotate(0, 0, side * angle)
    .translate(side * halfSpread / 2, 0, standH / 2);
};

const leftLeg = makeLeg(-1);
const rightLeg = makeLeg(1);

// Foot pads (flat rectangles at leg ends)
const footW = legW + 10;
const footD = 40;
const footH = 4;
const leftFoot = box(footW, footD, footH, true)
  .translate(-halfSpread, 0, footH / 2);
const rightFoot = box(footW, footD, footH, true)
  .translate(halfSpread, 0, footH / 2);

// Center bridge connecting legs to panel
const bridge = box(legW * 2, legThick, standH, true)
  .translate(0, 0, standH / 2);

const stand = union(leftLeg, rightLeg, leftFoot, rightFoot, bridge);

// --- Cable hole (through the bridge) ---
const cableHole = cylinder(legThick + 2, 10)
  .rotate(90, 0, 0)
  .translate(0, 0, standH / 2);

const standFinal = stand.subtract(cableHole);

return [
  { name: "Panel", shape: panel, color: "#1a1a1a" },
  { name: "Screen", shape: screen, color: "#050515" },
  { name: "Stand", shape: standFinal, color: "#2a2a2a" },
];

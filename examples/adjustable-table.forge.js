// Adjustable Height Table — manual crank mechanism
// Shows real construction details: telescoping legs, cross braces,
// crank shaft, and tabletop.
//
// BUILD NOTES (at bottom of file):
// Materials, dimensions, and assembly instructions for actually building this.

const topW = param("Top Width", 120, { min: 80, max: 200, unit: "cm" });
const topD = param("Top Depth", 60, { min: 40, max: 100, unit: "cm" });
const topThick = param("Top Thickness", 3, { min: 2, max: 5, unit: "cm" });
const minH = param("Min Height", 72, { min: 60, max: 80, unit: "cm" });
const maxH = param("Max Height", 120, { min: 100, max: 140, unit: "cm" });
const heightPct = param("Height %", 30, { min: 0, max: 100, unit: "%" });
const outerLeg = param("Outer Leg", 6, { min: 4, max: 10, unit: "cm" });
const innerLeg = param("Inner Leg", 4, { min: 3, max: 8, unit: "cm" });
const legWall = param("Leg Wall", 0.3, { min: 0.2, max: 0.5, unit: "cm" });
const inset = param("Leg Inset", 5, { min: 2, max: 15, unit: "cm" });
const braceW = param("Brace Width", 3, { min: 2, max: 5, unit: "cm" });
const braceH = param("Brace Height", 1.5, { min: 1, max: 3, unit: "cm" });
const crankR = param("Crank Radius", 8, { min: 5, max: 15, unit: "cm" });

// Current height based on slider
const currentH = minH + (maxH - minH) * heightPct / 100;
const legH = currentH - topThick;
const extensionH = legH - minH + topThick; // how much inner leg extends

// --- Tabletop ---
const top = box(topW, topD, topThick).translate(0, 0, legH);

// --- Outer legs (fixed, bolted to frame under tabletop) ---
// These are square tubes — outer shell minus inner hollow
const outerLegH = minH - topThick; // fixed portion height

const makeOuterLeg = (x, y) => {
  const outer = box(outerLeg, outerLeg, outerLegH).translate(x, y, legH - outerLegH);
  const inner = box(outerLeg - legWall * 2, outerLeg - legWall * 2, outerLegH + 1)
    .translate(x + legWall, y + legWall, legH - outerLegH - 0.5);
  return outer.subtract(inner);
};

// --- Inner legs (slide inside outer, extend downward) ---
const makeInnerLeg = (x, y) => {
  const legOffset = (outerLeg - innerLeg) / 2;
  const inner = box(innerLeg, innerLeg, legH)
    .translate(x + legOffset, y + legOffset, 0);
  const hollow = box(innerLeg - legWall * 2, innerLeg - legWall * 2, legH + 1)
    .translate(x + legOffset + legWall, y + legOffset + legWall, -0.5);
  return inner.subtract(hollow);
};

// Leg positions
const legPositions = [
  [inset, inset],
  [topW - inset - outerLeg, inset],
  [inset, topD - inset - outerLeg],
  [topW - inset - outerLeg, topD - inset - outerLeg],
];

const outerLegs = union(...legPositions.map(([x, y]) => makeOuterLeg(x, y)));
const innerLegs = union(...legPositions.map(([x, y]) => makeInnerLeg(x, y)));

// --- Locking pin holes (show where pins go through both tubes) ---
// Holes at multiple heights for discrete height adjustment
const pinHoleR = 0.4;
const pinSpacing = 5; // every 5cm
const pinHoles = [];
const numPins = Math.floor((maxH - minH) / pinSpacing);

for (const [lx, ly] of legPositions) {
  const legCenterX = lx + outerLeg / 2;
  const legCenterY = ly + outerLeg / 2;
  for (let i = 0; i <= numPins; i++) {
    const pz = legH - outerLegH + 5 + i * pinSpacing;
    if (pz > 0 && pz < legH) {
      // Through-hole in Y direction
      pinHoles.push(
        cylinder(outerLeg + 2, pinHoleR)
          .rotate(90, 0, 0)
          .translate(legCenterX, ly - 1, pz)
      );
    }
  }
}

// --- Cross braces (connect legs for rigidity) ---
// Front brace
const frontBraceLen = topW - 2 * inset - 2 * outerLeg;
const frontBrace = box(frontBraceLen, braceW, braceH)
  .translate(inset + outerLeg, inset + outerLeg / 2 - braceW / 2, legH - outerLegH + 10);

// Back brace
const backBrace = box(frontBraceLen, braceW, braceH)
  .translate(inset + outerLeg, topD - inset - outerLeg / 2 - braceW / 2, legH - outerLegH + 10);

// Side braces
const sideBraceLen = topD - 2 * inset - 2 * outerLeg;
const leftBrace = box(braceW, sideBraceLen, braceH)
  .translate(inset + outerLeg / 2 - braceW / 2, inset + outerLeg, legH - outerLegH + 10);
const rightBrace = box(braceW, sideBraceLen, braceH)
  .translate(topW - inset - outerLeg / 2 - braceW / 2, inset + outerLeg, legH - outerLegH + 10);

// --- Crank mechanism (side-mounted, visual representation) ---
// Crank shaft runs between front legs
const shaftY = inset + outerLeg / 2;
const shaftZ = legH - outerLegH + 25;
const shaftLen = topW - 2 * inset;
const shaft = cylinder(shaftLen, 0.8)
  .rotate(0, 90, 0)
  .translate(inset, shaftY, shaftZ);

// Crank handle (on the right side)
const handleX = topW - inset + 2;
const crankArm = cylinder(crankR, 0.5)
  .translate(handleX, shaftY, shaftZ);
const crankKnob = sphere(1.2)
  .translate(handleX, shaftY, shaftZ + crankR);

// --- Foot pads (rubber feet at bottom of inner legs) ---
const footPads = union(
  ...legPositions.map(([lx, ly]) => {
    const cx = lx + outerLeg / 2;
    const cy = ly + outerLeg / 2;
    return cylinder(0.5, innerLeg / 2 + 0.5)
      .translate(cx, cy, 0);
  })
);

// --- Assembly ---
let structure = union(outerLegs, innerLegs, frontBrace, backBrace, leftBrace, rightBrace);
if (pinHoles.length > 0) {
  structure = structure.subtract(union(...pinHoles));
}

return [
  { name: "Tabletop", shape: top, color: "#8B7355" },
  { name: "Leg Structure", shape: structure, color: "#888888" },
  { name: "Crank Shaft", shape: shaft, color: "#666666" },
  { name: "Crank Arm", shape: crankArm, color: "#555555" },
  { name: "Crank Knob", shape: crankKnob, color: "#444444" },
  { name: "Foot Pads", shape: footPads, color: "#333333" },
];

// ============================================================
// BUILD NOTES — How to actually build this table
// ============================================================
//
// MATERIALS:
// - Tabletop: 18mm plywood or solid wood panel (120×60cm)
// - Outer legs: 60×60mm square steel tube, 2mm wall (×4, cut to ~69cm)
// - Inner legs: 40×40mm square steel tube, 2mm wall (×4, cut to ~120cm)
// - Cross braces: 30×15mm steel flat bar (×4)
// - Crank shaft: 16mm steel rod, threaded ends
// - Locking pins: 8mm spring pins or clevis pins
// - Foot pads: rubber furniture feet (40mm)
// - Hardware: M8 bolts for frame, M6 for braces
//
// ASSEMBLY:
// 1. Cut all steel tubes to length. Deburr edges.
// 2. Weld or bolt cross braces to outer leg tubes at 10cm from top.
// 3. Slide inner legs into outer legs from below.
// 4. Drill pin holes through both tubes at 5cm intervals.
//    Use a drill press for alignment. Start from bottom.
// 5. Mount outer leg assembly to underside of tabletop with
//    L-brackets and M8 bolts (4 per leg).
// 6. Thread crank shaft through front legs. Add bearing blocks
//    or bushings at each leg pass-through.
// 7. Attach crank handle to shaft end.
// 8. For the crank-to-leg connection: weld a small gear or
//    threaded collar to the shaft at each inner leg position.
//    The inner leg needs a matching rack or threaded insert.
//    SIMPLER ALTERNATIVE: Skip the crank, use spring pins only
//    for discrete height positions (every 5cm).
// 9. Press-fit rubber feet onto inner leg bottoms.
// 10. Sand and paint/powder-coat all steel parts.
//
// TOOLS NEEDED:
// - Angle grinder or chop saw (cutting tubes)
// - Drill press (pin holes — alignment critical)
// - Welder (MIG preferred) OR bolt-together with brackets
// - Socket set, Allen keys
// - Level, tape measure, square
//
// COST ESTIMATE (EU prices, 2026):
// - Steel tubes: ~€40-60
// - Plywood top: ~€25-40
// - Hardware + feet: ~€15-20
// - Paint/finish: ~€10-15
// - Total: ~€90-135
//
// WEIGHT CAPACITY: ~80kg evenly distributed (depends on pin strength)
// Upgrade: use 2 pins per leg for more stability.

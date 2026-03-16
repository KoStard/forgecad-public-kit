// Bolted Joint — toolbox fastener library demo
//
// Shows a two-plate bolted joint using lib.fastenerSet():
//   - Top plate with M5 clearance holes (normal fit)
//   - Bottom plate with M5 tapped holes
//   - Bolts, washers, and nuts placed in the joint
//   - BOM listing fastener quantities
//   - Optional exploded view

const plateW    = param("Plate Width",  60, { min: 40, max: 120, unit: "mm" });
const plateD    = param("Plate Depth",  40, { min: 30, max:  80, unit: "mm" });
const topThick  = param("Top Thick",     8, { min:  4, max:  20, unit: "mm" });
const botThick  = param("Bot Thick",     8, { min:  4, max:  20, unit: "mm" });
const exploded  = param("Explode",       0, { min:  0, max:  1,  step: 1 });

// Bolt-circle inset from plate edge
const inset = 10;
const bxA = -plateW / 2 + inset;
const bxB =  plateW / 2 - inset;
const byA = -plateD / 2 + inset;
const byB =  plateD / 2 - inset;
const boltPositions = [
  [bxA, byA],
  [bxB, byA],
  [bxA, byB],
  [bxB, byB],
];

// M5 bolt long enough to pass through both plates plus nut engagement
const grip    = topThick + botThick;
const hw      = lib.fastenerSet("M5", grip + 4);
const { dims } = hw;

// --- Top plate: clearance holes (normal fit) ---
let topPlate = box(plateW, plateD, topThick, true);
for (const [x, y] of boltPositions) {
  topPlate = topPlate.subtract(
    hw.clearanceHole.translate(x, y, 0),
  );
}

// --- Bottom plate: tapped holes ---
let botPlate = box(plateW, plateD, botThick, true).translate(0, 0, -topThick - botThick);
for (const [x, y] of boltPositions) {
  botPlate = botPlate.subtract(
    hw.tappedHole.translate(x, y, -topThick - botThick),
  );
}

// --- Hardware: one fastener set per corner ---
const wt = dims.washerThickness;
const nh = dims.nutHeight;

const bolts   = [];
const washers = [];
const nuts    = [];

for (const [x, y] of boltPositions) {
  // Bolt: head top at z = topThick/2 + washer (under head), shaft points -Z
  const headZ = topThick / 2 + wt;
  bolts.push(hw.bolt.translate(x, y, headZ));

  // Washer under head (sits on top-plate top face)
  if (hw.washerUnderHead) {
    washers.push(hw.washerUnderHead.translate(x, y, topThick / 2 + wt / 2));
  }

  // Washer under nut (sits on bottom-plate bottom face)
  if (hw.washerUnderNut) {
    const nutZ = -topThick - botThick - wt / 2;
    washers.push(hw.washerUnderNut.translate(x, y, nutZ));
  }

  // Nut: centered just below the bottom washer
  const nutZ = -topThick - botThick - wt - nh / 2;
  nuts.push(hw.nut.translate(x, y, nutZ));
}

// --- BOM ---
bom([
  { name: "Top Plate",         qty: 1, material: "Aluminum 6061" },
  { name: "Bottom Plate",      qty: 1, material: "Aluminum 6061" },
  { name: `M5 × ${grip + 4} bolt`, qty: boltPositions.length, standard: "ISO 4762" },
  { name: "M5 washer",         qty: boltPositions.length * 2,  standard: "DIN 125-A" },
  { name: "M5 nut",            qty: boltPositions.length,      standard: "ISO 4032" },
]);

// --- Assemble named parts ---
const parts = [
  { name: "Top Plate",    shape: topPlate, color: "#9ab4cc" },
  { name: "Bottom Plate", shape: botPlate, color: "#b0b8c8" },
  ...bolts.map((s, i)   => ({ name: `Bolt ${i + 1}`,   shape: s, color: "#aaaaaa" })),
  ...washers.map((s, i) => ({ name: `Washer ${i + 1}`, shape: s, color: "#cccccc" })),
  ...nuts.map((s, i)    => ({ name: `Nut ${i + 1}`,    shape: s, color: "#999999" })),
];

if (exploded >= 1) {
  return lib.explode(parts, { factor: 2.5 });
}

return parts;

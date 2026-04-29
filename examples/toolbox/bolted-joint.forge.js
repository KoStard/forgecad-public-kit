// Bolted Joint — toolbox fastener library demo
//
// Shows a two-plate bolted joint using lib.fastenerSet():
//   - Top plate with M5 clearance holes (normal fit)
//   - Bottom plate with M5 tapped holes
//   - Bolts, washers, and nuts placed in the joint
//   - BOM listing fastener quantities
//   - Optional exploded view

const plateW    = Param.number("Plate Width",  60, { min: 40, max: 120, unit: "mm" });
const plateD    = Param.number("Plate Depth",  40, { min: 30, max:  80, unit: "mm" });
const topThick  = Param.number("Top Thick",     8, { min:  4, max:  20, unit: "mm" });
const botThick  = Param.number("Bot Thick",     8, { min:  4, max:  20, unit: "mm" });
const exploded  = Param.number("Explode",       0, { min:  0, max:  1,  step: 1 });

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
let topPlate = box(plateW, plateD, topThick);
for (const [x, y] of boltPositions) {
  topPlate = topPlate.subtract(
    hw.clearanceHole.translate(x, y, 0),
  );
}

// Key z-levels:
//   top plate is centered at z=0 → top face at +topThick/2, bottom face at -topThick/2
//   bottom plate sits flush below → top face at -topThick/2, center at -(topThick/2 + botThick/2)
const topFace    =  topThick / 2;
const botCenter  = -(topThick / 2 + botThick / 2);
const botFace    =  botCenter - botThick / 2;   // bottom face of bottom plate

// --- Bottom plate: tapped holes ---
let botPlate = box(plateW, plateD, botThick).translate(0, 0, botCenter);
for (const [x, y] of boltPositions) {
  botPlate = botPlate.subtract(
    hw.tappedHole.translate(x, y, botCenter),
  );
}

// --- Hardware: one fastener set per corner ---
const wt = dims.washerThickness;
const nh = dims.nutHeight;

const bolts   = [];
const washers = [];
const nuts    = [];

for (const [x, y] of boltPositions) {
  // Washer under head: sits flush on top-plate top face
  if (hw.washerUnderHead) {
    washers.push(hw.washerUnderHead.translate(x, y, topFace + wt / 2));
  }

  // Bolt: head bottom rests on top of the head washer
  bolts.push(hw.bolt.translate(x, y, topFace + wt));

  // Washer under nut: sits flush on bottom-plate bottom face
  if (hw.washerUnderNut) {
    washers.push(hw.washerUnderNut.translate(x, y, botFace - wt / 2));
  }

  // Nut: centered just below the nut washer
  nuts.push(hw.nut.translate(x, y, botFace - wt - nh / 2));
}

// --- BOM ---
bom(1, "Top Plate — Aluminum 6061");
bom(1, "Bottom Plate — Aluminum 6061");
bom(boltPositions.length, `M5 × ${grip + 4} hex bolt (ISO 4762)`);
bom(boltPositions.length * 2, "M5 flat washer (DIN 125-A)");
bom(boltPositions.length, "M5 hex nut (ISO 4032)");

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

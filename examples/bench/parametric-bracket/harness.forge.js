// Functional test harness for parametric-bracket benchmark
// This task returns a Shape (not assembly) — tests at two parameter values.

// We test at two bolt sizes to verify parametric behavior
// The bench runner places the solution at ./solution.forge.js
// We import it as a part at two different parameter values.

const smallBracket = importPart("./solution.forge.js", { paramOverrides: { "Bolt Diameter": 4 } });
const largeBracket = importPart("./solution.forge.js", { paramOverrides: { "Bolt Diameter": 8 } });

const results = [];
function test(name, check, failMsg) {
  let passed = false;
  try { passed = check(); } catch (e) { failMsg = failMsg || e.message; }
  results.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
  verify.that(name, () => passed, failMsg);
}
function bboxSize(shape) {
  const bb = shape.boundingBox();
  return [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];
}

// ===========================================================================
// T1-T2: Shape exists and is non-empty
test("T1: small bracket is non-empty", () => !smallBracket.isEmpty());
test("T2: large bracket is non-empty", () => !largeBracket.isEmpty());

// T3-T4: L-shape — significant extent in at least 2 axes
const smallSize = bboxSize(smallBracket);
const largeSize = bboxSize(largeBracket);
const smallSorted = [...smallSize].sort((a,b) => b-a);
const largeSorted = [...largeSize].sort((a,b) => b-a);

test("T3: small bracket is L-shaped (2+ axes > 10mm)",
  () => smallSorted[0] > 10 && smallSorted[1] > 10,
  `Dims: ${smallSize.map(d => d.toFixed(1)).join("x")}mm`
);
test("T4: large bracket is L-shaped (2+ axes > 20mm)",
  () => largeSorted[0] > 20 && largeSorted[1] > 20,
  `Dims: ${largeSize.map(d => d.toFixed(1)).join("x")}mm`
);

// T5: Parametric scaling — large bracket should be bigger than small
const smallVol = smallBracket.volume();
const largeVol = largeBracket.volume();
test("T5: large bracket has more volume than small",
  () => largeVol > smallVol * 1.5,
  `Small vol=${smallVol.toFixed(0)}, large vol=${largeVol.toFixed(0)}`
);

// T6: Mounting holes — volume should be less than a solid of same bbox
const smallBboxVol = smallSize[0] * smallSize[1] * smallSize[2];
const largeBboxVol = largeSize[0] * largeSize[1] * largeSize[2];
test("T6: small bracket has holes (vol < 60% of bbox)",
  () => smallVol < smallBboxVol * 0.6,
  `Vol/bbox ratio = ${(smallVol/smallBboxVol*100).toFixed(0)}%`
);

// T7: Not paper-thin — smallest dimension > 2mm for small bracket
test("T7: not paper-thin (min dim > 2mm)",
  () => smallSorted[2] > 2,
  `Thinnest = ${smallSorted[2].toFixed(1)}mm`
);

// T8: Reasonable proportions — no dimension more than 20x another
test("T8: reasonable proportions (aspect < 20:1)",
  () => smallSorted[0] / Math.max(smallSorted[2], 0.1) < 20,
  `Aspect = ${(smallSorted[0]/Math.max(smallSorted[2],0.1)).toFixed(1)}:1`
);

// T9: Large bracket bbox dimensions scale with bolt size
// bolt 8 vs bolt 4 → expect ~2x larger linear dimensions
const sizeRatio = largeSorted[0] / Math.max(smallSorted[0], 0.1);
test("T9: dimensions scale with bolt size (1.5-3x for 2x bolt)",
  () => sizeRatio > 1.3 && sizeRatio < 4,
  `Size ratio = ${sizeRatio.toFixed(2)}x`
);

// T10: Both have reasonable volume (not degenerate)
test("T10: both have volume > 100mm3",
  () => smallVol > 100 && largeVol > 100,
  `Small=${smallVol.toFixed(0)}mm3, Large=${largeVol.toFixed(0)}mm3`
);

// ===========================================================================
const passed = results.filter(r => r.passed).length;
const total = results.length;
console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║        FUNCTIONAL SCORING — PARAMETRIC BRACKET      ║");
console.warn("╟──────────────────────────────────────────────────────╢");
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const msg = r.passed ? "" : ` — ${r.failMsg}`;
  console.warn(`║  ${icon} ${r.name}${msg}`);
}
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${passed}/${total} (${Math.round(100*passed/total)}%)`);
console.warn(`║  Small: ${smallSize.map(d=>d.toFixed(0)).join("x")}mm vol=${smallVol.toFixed(0)}mm3`);
console.warn(`║  Large: ${largeSize.map(d=>d.toFixed(0)).join("x")}mm vol=${largeVol.toFixed(0)}mm3`);
console.warn("╚══════════════════════════════════════════════════════╝");

return largeBracket;

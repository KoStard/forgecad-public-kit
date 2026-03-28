// Functional test harness for parametric-bracket benchmark
// GATE/SCORE pattern — tests a Shape (not assembly) at two param values

const smallBracket = importPart("./solution.forge.js", { paramOverrides: { "Bolt Diameter": 4 } });
const largeBracket = importPart("./solution.forge.js", { paramOverrides: { "Bolt Diameter": 8 } });

const gateResults = [];
const testResults = [];

function gate(name, check, failMsg) {
  let passed = false;
  try { passed = !!check(); } catch (e) { failMsg = failMsg || e.message; }
  gateResults.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
}
function test(name, check, failMsg) {
  let passed = false;
  try { passed = !!check(); } catch (e) { failMsg = failMsg || e.message; }
  testResults.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
  verify.that(name, () => passed, failMsg);
}
function bboxSize(s) { const b = s.boundingBox(); return [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]]; }

// GATES
gate("Small bracket non-empty", () => !smallBracket.isEmpty());
gate("Large bracket non-empty", () => !largeBracket.isEmpty());

const allGatesPass = gateResults.every(g => g.passed);

// SCORED
if (allGatesPass) {
  const sSize = bboxSize(smallBracket);
  const lSize = bboxSize(largeBracket);
  const sSorted = [...sSize].sort((a,b) => b-a);
  const lSorted = [...lSize].sort((a,b) => b-a);
  const sVol = smallBracket.volume();
  const lVol = largeBracket.volume();
  const sBboxVol = sSize[0]*sSize[1]*sSize[2];
  const lBboxVol = lSize[0]*lSize[1]*lSize[2];

  // F1: L-shape — significant extent in 2+ axes
  test("F1: L-shaped (2 axes > 10mm)",
    () => sSorted[0] > 10 && sSorted[1] > 10,
    `Dims: ${sSize.map(d=>d.toFixed(1)).join("x")}mm`);

  // F2: Has holes (volume < 50% of bbox — an L with holes is much less than bbox)
  test("F2: Has holes (vol < 50% bbox)",
    () => sVol < sBboxVol * 0.5,
    `Vol/bbox = ${(sVol/sBboxVol*100).toFixed(0)}%`);

  // F3: Scales with bolt size (large > small by 1.5x volume)
  test("F3: Scales with bolt size (large > 1.5x small vol)",
    () => lVol > sVol * 1.5,
    `Small=${sVol.toFixed(0)}, Large=${lVol.toFixed(0)}, ratio=${(lVol/sVol).toFixed(2)}`);

  // F4: Not paper-thin
  test("F4: Not paper-thin (min dim > 2mm)", () => sSorted[2] > 2, `Min=${sSorted[2].toFixed(1)}mm`);

  // F5: Dimensions scale proportionally
  const sizeRatio = lSorted[0] / Math.max(sSorted[0], 0.1);
  test("F5: Dimensions scale (1.3-4x for 2x bolt)",
    () => sizeRatio > 1.3 && sizeRatio < 4,
    `Size ratio = ${sizeRatio.toFixed(2)}x`);
}

// SCORECARD
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 5;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║        FUNCTIONAL SCORING — PARAMETRIC BRACKET      ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed ? "✓" : "✗"} ${g.name}${g.passed ? "" : ` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed ? "✓" : "✗"} ${r.name}${r.passed ? "" : ` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return largeBracket;

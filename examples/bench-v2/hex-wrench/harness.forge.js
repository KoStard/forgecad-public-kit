// Hex wrench harness — probe-based functional testing
// Tests that the wrench jaw actually fits an M10 hex bolt head

const wrench = importPart("./solution.forge.js");

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
gate("Shape is not empty", () => !wrench.isEmpty());
gate("Shape has volume > 1000mm3", () => wrench.volume() > 1000);

const allGatesPass = gateResults.every(g => g.passed);

if (allGatesPass) {
  const bb = wrench.boundingBox();
  const size = bboxSize(wrench);
  const vol = wrench.volume();
  const bboxVol = size[0] * size[1] * size[2];

  // F1: One piece — single solid (volume / bbox ratio sanity check)
  test("F1: Single solid piece (vol/bbox > 5%)",
    () => vol / bboxVol > 0.05,
    `Vol/bbox = ${(vol/bboxVol*100).toFixed(1)}% — too sparse, likely broken geometry`
  );

  // F2: Elongated shape (handle) — longest dim > 100mm
  const sorted = [...size].sort((a,b) => b-a);
  test("F2: Has handle (longest dim > 100mm)",
    () => sorted[0] > 100,
    `Longest dim = ${sorted[0].toFixed(0)}mm`
  );

  // F3: Not too thick — wrench is flat-ish (thinnest dim < 15mm)
  test("F3: Wrench is flat (thinnest dim < 15mm)",
    () => sorted[2] < 15,
    `Thinnest = ${sorted[2].toFixed(1)}mm`
  );

  // F4: PROBE TEST — M10 hex bolt head fits in the jaw
  // Create a hex prism (17mm across-flats) and check if it intersects
  // with the wrench's jaw region (far end of the wrench)
  const hexAcrossFlats = 17;
  const hexR = hexAcrossFlats / (2 * Math.cos(Math.PI / 6)); // circumradius
  const hexProbe = cylinder(size[2] + 10, hexR, hexR, 6, true);

  // Position the probe at the jaw end of the wrench
  // The jaw is at the extreme end of the longest axis
  const jawCenter = [(bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2];
  // Find which axis is longest and position probe at the far end
  const maxAxis = size.indexOf(sorted[0]);
  jawCenter[maxAxis] = bb.max[maxAxis] - sorted[0] * 0.15; // near the tip

  const positionedProbe = hexProbe.translate(jawCenter[0], jawCenter[1], jawCenter[2]);
  const probeVol = Math.PI * hexR * hexR * (size[2] + 10); // approximate

  // The wrench jaw should PARTIALLY overlap the bolt (wraps around it)
  // but NOT fully contain it (it's an open jaw, not a socket)
  const overlap = intersection(wrench, positionedProbe);
  const overlapVol = overlap.isEmpty() ? 0 : overlap.volume();

  test("F4: Jaw overlaps hex bolt probe (10-80% of bolt volume)",
    () => overlapVol > probeVol * 0.10 && overlapVol < probeVol * 0.80,
    `Overlap = ${(overlapVol/probeVol*100).toFixed(0)}% of bolt — ${overlapVol < probeVol*0.10 ? "jaw too far/small" : "jaw encloses bolt (socket, not open wrench)"}`
  );

  // F5: Material removed for jaw — total volume less than a solid bar
  // An open-jaw wrench has significant cutout compared to its bbox
  test("F5: Material removed for jaw (vol < 50% of bbox)",
    () => vol < bboxVol * 0.50,
    `Vol = ${(vol/bboxVol*100).toFixed(0)}% of bbox`
  );

  // F6: Volume is in plausible wrench range
  test("F6: Volume in wrench range (5000-50000mm3)",
    () => vol > 5000 && vol < 50000,
    `Vol = ${vol.toFixed(0)}mm3`
  );
}

// SCORECARD
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║          FUNCTIONAL SCORING — HEX WRENCH            ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed ? "✓" : "✗"} ${g.name}${g.passed ? "" : ` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed ? "✓" : "✗"} ${r.name}${r.passed ? "" : ` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return wrench;

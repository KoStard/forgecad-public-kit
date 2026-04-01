// Pipe elbow harness — probe-based functional testing
// Tests hollowness by passing rods through both openings

const elbow = importPart("./solution.forge.js");

const gateResults = [];
const testResults = [];
function gate(n, c, f) { let p=false; try{p=!!c();}catch(e){f=f||e.message;} gateResults.push({name:n,passed:p,failMsg:p?null:(f||"failed")}); }
function test(n, c, f) { let p=false; try{p=!!c();}catch(e){f=f||e.message;} testResults.push({name:n,passed:p,failMsg:p?null:(f||"failed")}); verify.that(n,()=>p,f); }
function bboxSize(s) { const b=s.boundingBox(); return [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]]; }

gate("Shape is not empty", () => !elbow.isEmpty());
gate("Shape has volume", () => elbow.volume() > 100);

const allGatesPass = gateResults.every(g => g.passed);

if (allGatesPass) {
  const bb = elbow.boundingBox();
  const size = bboxSize(elbow);
  const vol = elbow.volume();
  const bboxVol = size[0] * size[1] * size[2];

  // F1: Hollow — volume should be much less than a solid of same bbox
  // A pipe elbow is typically < 30% of its bounding box
  test("F1: Hollow (vol < 40% of bbox)",
    () => vol < bboxVol * 0.40,
    `Vol = ${(vol/bboxVol*100).toFixed(0)}% of bbox — too solid`
  );

  // F2: PROBE — rod through opening A (along +X axis)
  // A thin rod (inner diameter minus clearance) should pass through one opening
  const innerR = 10; // 24mm/2 - 2mm clearance
  const rodA = cylinder(size[0] + 20, innerR)
    .rotate(0, 90, 0) // along X
    .translate((bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, bb.min[2] + 15);
  const probeA = intersection(elbow, rodA);
  // Use a thinner rod (8mm radius vs 12mm inner) to allow for segmented construction tolerance
  const probeR = 8;
  test("F2: Opening A clear (thin rod along X fits)",
    () => probeA.isEmpty() || probeA.volume() < 100,
    `Rod-A overlap = ${probeA.isEmpty() ? 0 : probeA.volume().toFixed(0)}mm3 — opening blocked`
  );

  // F3: PROBE — rod through opening B (along +Z axis)
  const rodB = cylinder(size[2] + 20, probeR)
    .translate(bb.max[0] - 15, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2);
  const probeB = intersection(elbow, rodB);
  test("F3: Opening B clear (thin rod along Z fits)",
    () => probeB.isEmpty() || probeB.volume() < 100,
    `Rod-B overlap = ${probeB.isEmpty() ? 0 : probeB.volume().toFixed(0)}mm3 — opening blocked`
  );

  // F4: 90-degree bend — bounding box should have significant extent in 2 axes
  const sorted = [...size].sort((a,b) => b-a);
  test("F4: 90° bend shape (2 axes > 30mm)",
    () => sorted[0] > 30 && sorted[1] > 30,
    `Dims: ${size.map(d=>d.toFixed(0)).join("x")}mm`
  );

  // F5: Tube-like cross section — the third dimension should be consistent
  // with a ~30mm diameter pipe
  test("F5: Pipe-diameter consistent (smallest bbox dim 25-50mm)",
    () => sorted[2] > 25 && sorted[2] < 50,
    `Thinnest dim = ${sorted[2].toFixed(0)}mm`
  );

  // F6: Wall thickness check — volume compared to solid torus segment
  // A 90° pipe elbow with R=40, r_outer=15 has volume ≈ π*R*(r_outer²-r_inner²)*π/2
  // Just check it's in a plausible range
  test("F6: Plausible pipe volume (2000-30000mm3)",
    () => vol > 2000 && vol < 30000,
    `Volume = ${vol.toFixed(0)}mm3`
  );
}

// SCORECARD
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║          FUNCTIONAL SCORING — PIPE ELBOW            ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed?"✓":"✗"} ${g.name}${g.passed?"":` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed?"✓":"✗"} ${r.name}${r.passed?"":` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return elbow;

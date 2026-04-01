// Bracket harness — probe-based testing with bolt probes through holes

const bracket = importPart("./solution.forge.js");

const gateResults = [];
const testResults = [];
function gate(n, c, f) { let p=false; try{p=!!c();}catch(e){f=f||e.message;} gateResults.push({name:n,passed:p,failMsg:p?null:(f||"failed")}); }
function test(n, c, f) { let p=false; try{p=!!c();}catch(e){f=f||e.message;} testResults.push({name:n,passed:p,failMsg:p?null:(f||"failed")}); verify.that(n,()=>p,f); }
function bboxSize(s) { const b=s.boundingBox(); return [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]]; }

gate("Shape is not empty", () => !bracket.isEmpty());
gate("Shape has volume > 500mm3", () => bracket.volume() > 500);

const allGatesPass = gateResults.every(g => g.passed);

if (allGatesPass) {
  const bb = bracket.boundingBox();
  const size = bboxSize(bracket);
  const vol = bracket.volume();
  const bboxVol = size[0] * size[1] * size[2];

  // F1: L-shape — extent in 2+ axes > 25mm, but not a solid cube
  const sorted = [...size].sort((a,b) => b-a);
  test("F1: L-shaped (2 axes > 25mm)",
    () => sorted[0] > 25 && sorted[1] > 25,
    `Dims: ${size.map(d=>d.toFixed(0)).join("x")}mm`
  );

  // F2: Material removed — holes + L-shape means vol < 45% of bbox
  test("F2: Material removed for L + holes (vol < 45% bbox)",
    () => vol < bboxVol * 0.45,
    `Vol = ${(vol/bboxVol*100).toFixed(0)}% of bbox`
  );

  // F3: PROBE — M6 bolt through hole in plate A
  // Try bolts along all 3 axes through the bracket center regions
  const boltR = 6.5 / 2; // M6 clearance
  const probes = [
    cylinder(size[0]+20, boltR).rotate(0,90,0).translate((bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, bb.min[2]+size[2]*0.3),
    cylinder(size[1]+20, boltR).rotate(90,0,0).translate(bb.min[0]+size[0]*0.3, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2),
    cylinder(size[2]+20, boltR).translate((bb.min[0]+bb.max[0])/2, bb.min[1]+size[1]*0.3, (bb.min[2]+bb.max[2])/2),
    // Also try near edges of each plate
    cylinder(size[0]+20, boltR).rotate(0,90,0).translate((bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, bb.max[2]-size[2]*0.3),
    cylinder(size[1]+20, boltR).rotate(90,0,0).translate(bb.max[0]-size[0]*0.3, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2),
    cylinder(size[2]+20, boltR).translate((bb.min[0]+bb.max[0])/2, bb.max[1]-size[1]*0.3, (bb.min[2]+bb.max[2])/2),
  ];

  // A bolt "passes through" if its intersection with the bracket is empty
  // (the hole clears the bolt entirely)
  let holesFound = 0;
  for (const probe of probes) {
    const hit = intersection(bracket, probe);
    if (hit.isEmpty()) holesFound++;
  }

  test("F3: At least 1 through-hole found (bolt probe passes clean)",
    () => holesFound >= 1,
    `${holesFound}/6 probes passed through — no clear through-holes found`
  );

  test("F4: At least 2 through-holes (one per plate)",
    () => holesFound >= 2,
    `Only ${holesFound} clear holes found`
  );

  // F5: Volume consistent with L-bracket (not a solid block)
  // An L-bracket with holes is roughly 2 plates * W * H * t minus holes
  // Should be in range 5000-20000mm3 for ~40x30x5mm plates
  test("F5: Volume in bracket range (3000-25000mm3)",
    () => vol > 3000 && vol < 25000,
    `Volume = ${vol.toFixed(0)}mm3`
  );

  // F6: Reasonable proportions
  test("F6: Not too elongated (aspect < 10:1)",
    () => sorted[0] / Math.max(sorted[2], 0.1) < 10,
    `Aspect = ${(sorted[0]/Math.max(sorted[2],0.1)).toFixed(1)}:1`
  );
}

// SCORECARD
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║        FUNCTIONAL SCORING — BRACKET + HOLES         ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed?"✓":"✗"} ${g.name}${g.passed?"":` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed?"✓":"✗"} ${r.name}${r.passed?"":` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return bracket;

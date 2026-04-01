// Functional test harness for simple-tongs benchmark
// GATE/SCORE pattern

const solution = importAssembly("./solution.forge.js");
const asm = solution.assembly;
const desc = asm.describe();

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
function bboxCenter(s) { const b = s.boundingBox(); return [(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2]; }
function bboxSize(s) { const b = s.boundingBox(); return [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]]; }
function bboxOverlap(a, b) { return [0,1,2].map(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])); }
function dist3(a, b) { return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2); }

// GATES
const partNames = desc.parts.map(p => p.name);
gate("ArmA exists", () => partNames.includes("ArmA"));
gate("ArmB exists", () => partNames.includes("ArmB"));
const pivot = desc.joints.find(j => j.name === "pivot");
gate("pivot is revolute", () => pivot && pivot.type === "revolute");
gate("pivot range includes 0-30", () => pivot && pivot.min <= 0 && pivot.max >= 30);

const allGatesPass = gateResults.every(g => g.passed);
const closed = allGatesPass ? solution.solve({ pivot: 0 }) : null;

// SCORED
if (allGatesPass) {
  const armABB = closed.getPart("ArmA").boundingBox();
  const armBBB = closed.getPart("ArmB").boundingBox();
  const overlap = bboxOverlap(armABB, armBBB);

  const touchAxes = overlap.filter(v => v > -3).length;
  test("F1: Arms physically adjacent at pivot",
    () => touchAxes >= 2,
    `Only ${touchAxes}/3 axes in contact. Overlap: [${overlap.map(v=>v.toFixed(1)).join(", ")}]`);

  const aSize = bboxSize(closed.getPart("ArmA"));
  const bSize = bboxSize(closed.getPart("ArmB"));
  test("F2: Arms are elongated (aspect > 3:1)",
    () => Math.max(...aSize)/Math.max(Math.min(...aSize),0.1) > 3 && Math.max(...bSize)/Math.max(Math.min(...bSize),0.1) > 3,
    `ArmA=${(Math.max(...aSize)/Math.max(Math.min(...aSize),0.1)).toFixed(1)}, ArmB=${(Math.max(...bSize)/Math.max(Math.min(...bSize),0.1)).toFixed(1)}`);

  const positiveGaps = overlap.map(v => -v).filter(v => v > 0);
  const jawGap = positiveGaps.length > 0 ? Math.min(...positiveGaps) : 0;
  test("F3: Jaw gap < 10mm when closed", () => jawGap < 10, `Gap=${jawGap.toFixed(1)}mm`);

  const open = solution.solve({ pivot: 30 });
  const closedDist = dist3(bboxCenter(closed.getPart("ArmA")), bboxCenter(closed.getPart("ArmB")));
  const openDist = dist3(bboxCenter(open.getPart("ArmA")), bboxCenter(open.getPart("ArmB")));
  test("F4: Jaws spread >10mm at 30°", () => openDist - closedDist > 10, `Spread increase=${(openDist-closedDist).toFixed(1)}mm`);

  try {
    const sweep = asm.sweepJoint("pivot", 0, 30, 12);
    const hits = sweep.filter(f => f.collisions.length > 0);
    test("F5: No collision 0-30°", () => hits.length === 0, `Collisions in ${hits.length}/${sweep.length} frames`);
  } catch (e) { test("F5: Collision-free", () => false, e.message); }

  const aVol = aSize[0]*aSize[1]*aSize[2];
  const bVol = bSize[0]*bSize[1]*bSize[2];
  test("F6: Arms roughly symmetric (vol ratio < 3:1)",
    () => Math.max(aVol,bVol)/Math.max(Math.min(aVol,bVol),1) < 3,
    `Ratio=${(Math.max(aVol,bVol)/Math.max(Math.min(aVol,bVol),1)).toFixed(1)}`);
}

// SCORECARD
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║          FUNCTIONAL SCORING — SIMPLE TONGS          ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed ? "✓" : "✗"} ${g.name}${g.passed ? "" : ` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed ? "✓" : "✗"} ${r.name}${r.passed ? "" : ` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");
return closed || solution.solve({});

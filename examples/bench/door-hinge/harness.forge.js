// Functional test harness for door-hinge benchmark
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
function bboxOverlap(a, b) {
  return [0,1,2].map(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
}
function dist3(a, b) { return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2); }

// ===========================================================================
// GATES
// ===========================================================================
const partNames = desc.parts.map(p => p.name);
gate("Frame exists", () => partNames.includes("Frame"));
gate("Door exists", () => partNames.includes("Door"));
const hinge = desc.joints.find(j => j.name === "hinge");
gate("hinge joint is revolute", () => hinge && hinge.type === "revolute");
gate("hinge range includes 0-90", () => hinge && hinge.min <= 0 && hinge.max >= 90);

const allGatesPass = gateResults.every(g => g.passed);
const closed = allGatesPass ? solution.solve({ hinge: 0 }) : null;

// ===========================================================================
// SCORED
// ===========================================================================
if (allGatesPass) {
  const frameBB = closed.getPart("Frame").boundingBox();
  const doorBB = closed.getPart("Door").boundingBox();
  const overlap = bboxOverlap(frameBB, doorBB);

  // F1: Physical connection — Frame and Door touch/overlap at the hinge edge
  // At closed position, parts should share at least one edge (overlap in 2+ axes)
  const touchingAxes = overlap.filter(v => v > -2).length; // within 2mm
  test("F1: Frame and Door physically touch at hinge",
    () => touchingAxes >= 2,
    `Only ${touchingAxes}/3 axes within contact range. Overlap: [${overlap.map(v=>v.toFixed(1)).join(", ")}]`
  );

  // F2: Parts don't OVERLAP volumetrically when closed (they should be adjacent, not intersecting)
  const allOverlap = overlap.every(v => v > 1); // if positive on all 3 axes = volumetric intersection
  test("F2: Parts don't intersect when closed",
    () => !allOverlap,
    `Parts overlap on all axes — they're inside each other`
  );

  // F3: When opened to 90°, door has moved substantially
  const open90 = solution.solve({ hinge: 90 });
  const doorClosedCenter = bboxCenter(closed.getPart("Door"));
  const doorOpenCenter = bboxCenter(open90.getPart("Door"));
  const doorMovement = dist3(doorClosedCenter, doorOpenCenter);
  test("F3: Door moves significantly when opened to 90°",
    () => doorMovement > 30,
    `Door center moved only ${doorMovement.toFixed(1)}mm`
  );

  // F4: Frame stays stationary when door opens
  const frameClosedCenter = bboxCenter(closed.getPart("Frame"));
  const frameOpenCenter = bboxCenter(open90.getPart("Frame"));
  const frameMovement = dist3(frameClosedCenter, frameOpenCenter);
  test("F4: Frame stays stationary",
    () => frameMovement < 1,
    `Frame moved ${frameMovement.toFixed(1)}mm — should be fixed`
  );

  // F5: No collision during 0-90° sweep
  try {
    const sweep = asm.sweepJoint("hinge", 0, 90, 12);
    const hits = sweep.filter(f => f.collisions.length > 0);
    test("F5: No collision during 0-90° sweep",
      () => hits.length === 0,
      `Collisions in ${hits.length}/${sweep.length} frames`
    );
  } catch (e) {
    test("F5: Collision-free sweep", () => false, e.message);
  }

  // F6: Both plates are flat (one dimension much smaller than others)
  const frameSize = bboxSize(closed.getPart("Frame"));
  const doorSize = bboxSize(closed.getPart("Door"));
  const frameSorted = [...frameSize].sort((a,b) => a-b);
  const doorSorted = [...doorSize].sort((a,b) => a-b);
  test("F6: Both plates are flat (thinnest dim < 20% of widest)",
    () => frameSorted[0] < frameSorted[2] * 0.2 && doorSorted[0] < doorSorted[2] * 0.2,
    `Frame ratio=${(frameSorted[0]/frameSorted[2]).toFixed(2)}, Door ratio=${(doorSorted[0]/doorSorted[2]).toFixed(2)}`
  );
}

// ===========================================================================
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║           FUNCTIONAL SCORING — DOOR HINGE           ║");
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

// Functional test harness for simple-tongs benchmark
// Tests: solution.forge.js
//
// Each test() call runs a verify.that() AND tracks pass/fail for scoring.

const solution = importAssembly("./solution.forge.js");
const asm = solution.assembly;
const desc = asm.describe();

// ---------------------------------------------------------------------------
// Scoring wrapper
// ---------------------------------------------------------------------------

const results = [];
function test(name, check, failMsg) {
  let passed = false;
  try { passed = check(); } catch (e) { failMsg = failMsg || e.message; }
  results.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
  verify.that(name, () => passed, failMsg);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bboxSize(shape) {
  const bb = shape.boundingBox();
  return [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
}

function bboxCenter(shape) {
  const bb = shape.boundingBox();
  return [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
}

function dist3(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// ===========================================================================
// TESTS
// ===========================================================================

// --- T1-T2: Structure ---
const partNames = desc.parts.map(p => p.name);
test("T1: ArmA exists", () => partNames.includes("ArmA"));
test("T2: ArmB exists", () => partNames.includes("ArmB"));

// --- T3-T4: Joint type and range ---
const pivotJoint = desc.joints.find(j => j.name === "pivot");
test("T3: pivot joint is revolute",
  () => pivotJoint && pivotJoint.type === "revolute",
  pivotJoint ? `Joint type is '${pivotJoint.type}'` : "No pivot joint found"
);
test("T4: pivot range includes 0-30deg",
  () => pivotJoint && pivotJoint.min <= 0 && pivotJoint.max >= 30,
  pivotJoint ? `Range is [${pivotJoint.min}, ${pivotJoint.max}]` : "No pivot joint"
);

// --- T5: Physical realizability (ghost joint detection) ---
const restSolved = solution.solve({ pivot: 0 });
const armACenter = bboxCenter(restSolved.getPart("ArmA"));
const armBCenter = bboxCenter(restSolved.getPart("ArmB"));
const centerDist = dist3(armACenter, armBCenter);

test("T5: arms physically close (centers < 40mm)",
  () => centerDist < 40,
  `Arm centers are ${centerDist.toFixed(1)}mm apart — ghost joint`
);

// --- T6: Gripping (jaw gap when closed) ---
// Measure the minimum gap between arm bounding boxes across all 3 axes.
// The smallest positive axis gap tells us how close the jaws are.
const armABB = restSolved.getPart("ArmA").boundingBox();
const armBBB = restSolved.getPart("ArmB").boundingBox();

// Per-axis gap: positive = separated, negative = overlapping on that axis
const gaps = [
  Math.max(armABB.min[0] - armBBB.max[0], armBBB.min[0] - armABB.max[0]), // X
  Math.max(armABB.min[1] - armBBB.max[1], armBBB.min[1] - armABB.max[1]), // Y
  Math.max(armABB.min[2] - armBBB.max[2], armBBB.min[2] - armABB.max[2]), // Z
];
// The jaw gap is the largest positive gap (axis with actual separation)
const jawGapClosed = Math.max(...gaps);

test("T6: jaw gap < 10mm when closed",
  () => jawGapClosed >= 0 && jawGapClosed < 10,
  `Jaw gap is ${jawGapClosed.toFixed(1)}mm${jawGapClosed < 0 ? " (overlapping!)" : " — too wide to grip"}`
);

// --- T7: Opening spread ---
let jawGapOpen = 0;
try {
  const openSolved = solution.solve({ pivot: 30 });
  const openACenter = bboxCenter(openSolved.getPart("ArmA"));
  const openBCenter = bboxCenter(openSolved.getPart("ArmB"));
  jawGapOpen = dist3(openACenter, openBCenter);
  test("T7: jaws spread > 20mm at 30deg",
    () => jawGapOpen > 20,
    `Spread is only ${jawGapOpen.toFixed(1)}mm`
  );
} catch (e) {
  test("T7: jaws spread at 30deg", () => false, `Solve failed: ${e.message}`);
}

// --- T8: Collision-free sweep ---
try {
  const sweep = asm.sweepJoint("pivot", 0, 30, 12);
  const collisionFrames = sweep.filter(f => f.collisions.length > 0);
  test("T8: no collision during 0-30deg sweep",
    () => collisionFrames.length === 0,
    `Collisions in ${collisionFrames.length}/${sweep.length} frames`
  );
} catch (e) {
  test("T8: collision-free sweep", () => false, `Sweep failed: ${e.message}`);
}

// --- T9-T10: Meaningful geometry ---
const armASize = bboxSize(restSolved.getPart("ArmA"));
const armBSize = bboxSize(restSolved.getPart("ArmB"));
const armAVol = armASize[0] * armASize[1] * armASize[2];
const armBVol = armBSize[0] * armBSize[1] * armBSize[2];

test("T9: ArmA has real geometry (bbox > 1000mm3)",
  () => armAVol > 1000,
  `ArmA bbox vol = ${armAVol.toFixed(0)}mm3`
);
test("T10: ArmB has real geometry (bbox > 1000mm3)",
  () => armBVol > 1000,
  `ArmB bbox vol = ${armBVol.toFixed(0)}mm3`
);

// ===========================================================================
// SCORECARD
// ===========================================================================

const passed = results.filter(r => r.passed).length;
const total = results.length;
const pct = Math.round(100 * passed / total);

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║           FUNCTIONAL SCORING — SIMPLE TONGS         ║");
console.warn("╟──────────────────────────────────────────────────────╢");
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const msg = r.passed ? "" : ` — ${r.failMsg}`;
  console.warn(`║  ${icon} ${r.name}${msg}`);
}
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${passed}/${total} (${pct}%)                `);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  Jaw gap (closed): ${jawGapClosed.toFixed(1)}mm  |  Spread (open): ${jawGapOpen.toFixed(1)}mm`);
console.warn(`║  ArmA bbox: ${armAVol.toFixed(0)}mm3  |  ArmB bbox: ${armBVol.toFixed(0)}mm3`);
console.warn(`║  Arm center distance: ${centerDist.toFixed(1)}mm`);
console.warn("╚══════════════════════════════════════════════════════╝");

return restSolved;

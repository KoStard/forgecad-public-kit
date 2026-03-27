// Functional test harness for door-hinge benchmark
// Imports ./solution.forge.js — the bench runner places the LLM's solution there.

const solution = importAssembly("./solution.forge.js");
const asm = solution.assembly;
const desc = asm.describe();

// ---------------------------------------------------------------------------
const results = [];
function test(name, check, failMsg) {
  let passed = false;
  try { passed = check(); } catch (e) { failMsg = failMsg || e.message; }
  results.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
  verify.that(name, () => passed, failMsg);
}

function bboxSize(shape) {
  const bb = shape.boundingBox();
  return [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
}
function bboxCenter(shape) {
  const bb = shape.boundingBox();
  return [(bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2];
}
function dist3(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2); }
function maxDim(shape) { const s = bboxSize(shape); return Math.max(...s); }

// ===========================================================================
const partNames = desc.parts.map(p => p.name);
test("T1: Frame exists", () => partNames.includes("Frame"));
test("T2: Door exists", () => partNames.includes("Door"));

const hinge = desc.joints.find(j => j.name === "hinge");
test("T3: hinge joint is revolute",
  () => hinge && hinge.type === "revolute",
  hinge ? `Type is '${hinge.type}'` : "No hinge joint"
);
test("T4: hinge range includes 0-90deg",
  () => hinge && hinge.min <= 0 && hinge.max >= 90,
  hinge ? `Range [${hinge.min}, ${hinge.max}]` : "No hinge"
);

// Physical realizability
const closed = solution.solve({ hinge: 0 });
const frameCenter = bboxCenter(closed.getPart("Frame"));
const doorCenter = bboxCenter(closed.getPart("Door"));
const partDist = dist3(frameCenter, doorCenter);
test("T5: parts physically close (< 80mm)",
  () => partDist < 80,
  `Part centers ${partDist.toFixed(1)}mm apart`
);

// Coplanar check at closed: both parts should share similar Y or X extent
// (flexible — just check they overlap in at least one horizontal axis)
const frameBB = closed.getPart("Frame").boundingBox();
const doorBB = closed.getPart("Door").boundingBox();
const xOverlap = Math.min(frameBB.max[0], doorBB.max[0]) - Math.max(frameBB.min[0], doorBB.min[0]);
const yOverlap = Math.min(frameBB.max[1], doorBB.max[1]) - Math.max(frameBB.min[1], doorBB.min[1]);
test("T6: plates overlap in XY when closed",
  () => xOverlap > 0 || yOverlap > 0,
  `No XY overlap — plates not coplanar`
);

// Opening: at 90deg the door should have moved significantly
let doorMoved = 0;
try {
  const open = solution.solve({ hinge: 90 });
  const doorOpenCenter = bboxCenter(open.getPart("Door"));
  doorMoved = dist3(doorCenter, doorOpenCenter);
  test("T7: door moves > 20mm when opened to 90deg",
    () => doorMoved > 20,
    `Door moved only ${doorMoved.toFixed(1)}mm`
  );
} catch (e) {
  test("T7: door opens to 90deg", () => false, e.message);
}

// Collision-free sweep
try {
  const sweep = asm.sweepJoint("hinge", 0, 90, 12);
  const hits = sweep.filter(f => f.collisions.length > 0);
  test("T8: no collision 0-90deg",
    () => hits.length === 0,
    `Collisions in ${hits.length}/${sweep.length} frames`
  );
} catch (e) {
  test("T8: collision-free sweep", () => false, e.message);
}

// Reasonable size
test("T9: Frame large enough (> 40mm)",
  () => maxDim(closed.getPart("Frame")) > 40,
  `Frame max dim = ${maxDim(closed.getPart("Frame")).toFixed(0)}mm`
);
test("T10: Door large enough (> 40mm)",
  () => maxDim(closed.getPart("Door")) > 40,
  `Door max dim = ${maxDim(closed.getPart("Door")).toFixed(0)}mm`
);

// ===========================================================================
const passed = results.filter(r => r.passed).length;
const total = results.length;
console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║           FUNCTIONAL SCORING — DOOR HINGE           ║");
console.warn("╟──────────────────────────────────────────────────────╢");
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const msg = r.passed ? "" : ` — ${r.failMsg}`;
  console.warn(`║  ${icon} ${r.name}${msg}`);
}
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${passed}/${total} (${Math.round(100*passed/total)}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return closed;

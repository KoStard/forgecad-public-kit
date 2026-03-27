// Functional test harness for gear-reducer benchmark

const solution = importAssembly("./solution.forge.js");
const asm = solution.assembly;
const desc = asm.describe();

const results = [];
function test(name, check, failMsg) {
  let passed = false;
  try { passed = check(); } catch (e) { failMsg = failMsg || e.message; }
  results.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
  verify.that(name, () => passed, failMsg);
}
function bboxCenter(shape) {
  const bb = shape.boundingBox();
  return [(bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2];
}
function bboxSize(shape) {
  const bb = shape.boundingBox();
  return [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];
}
function dist2(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2); }

// ===========================================================================
const partNames = desc.parts.map(p => p.name);
test("T1: Pinion exists", () => partNames.includes("Pinion"));
test("T2: Gear exists", () => partNames.includes("Gear"));
test("T3: Base/frame exists", () => partNames.includes("Base") || partNames.some(n => n.toLowerCase().includes("base") || n.toLowerCase().includes("frame")));

const driveJoint = desc.joints.find(j => j.name === "drive");
const outputJoint = desc.joints.find(j => j.name === "output");
test("T4: drive joint is revolute",
  () => driveJoint && driveJoint.type === "revolute",
  driveJoint ? `Type '${driveJoint.type}'` : "No drive joint"
);
test("T5: output joint is revolute",
  () => outputJoint && outputJoint.type === "revolute",
  outputJoint ? `Type '${outputJoint.type}'` : "No output joint"
);

// Gear ratio: drive=90 → output should be ~-30 (3:1 reversed)
let actualRatio = 0;
try {
  const atDrive90 = asm.solve({ drive: 90 });
  const state = atDrive90.getJointState();
  const outputAngle = state.output || 0;
  actualRatio = 90 / Math.abs(outputAngle || 0.001);

  test("T6: gear ratio ~3:1 (output ~-30deg at drive=90)",
    () => Math.abs(outputAngle - (-30)) < 5,
    `Output = ${outputAngle.toFixed(1)}deg (expected ~-30)`
  );
} catch (e) {
  test("T6: gear ratio 3:1", () => false, e.message);
}

// Gears physically close (center distance reasonable)
const rest = solution.solve({ drive: 0 });
const pinionCenter = bboxCenter(rest.getPart("Pinion"));
const gearCenter = bboxCenter(rest.getPart("Gear"));
const centerDist = dist2(pinionCenter, gearCenter);

test("T7: gears physically close (XY distance 10-100mm)",
  () => centerDist > 10 && centerDist < 100,
  `Center distance = ${centerDist.toFixed(1)}mm`
);

// No collision at rest
try {
  const collisions = rest.collisionReport({ minOverlapVolume: 1 });
  const gearCollisions = collisions.filter(c =>
    (c.partA === "Pinion" && c.partB === "Gear") ||
    (c.partA === "Gear" && c.partB === "Pinion")
  );
  test("T8: gears don't collide at rest",
    () => gearCollisions.length === 0,
    `${gearCollisions.length} collision(s)`
  );
} catch (e) {
  test("T8: no collision at rest", () => false, e.message);
}

// Real geometry
const pinionSize = bboxSize(rest.getPart("Pinion"));
const gearSize = bboxSize(rest.getPart("Gear"));
const pVol = pinionSize[0] * pinionSize[1] * pinionSize[2];
const gVol = gearSize[0] * gearSize[1] * gearSize[2];
test("T9: Pinion has geometry", () => pVol > 100, `Bbox vol = ${pVol.toFixed(0)}mm3`);
test("T10: Gear has geometry", () => gVol > 100, `Bbox vol = ${gVol.toFixed(0)}mm3`);

// ===========================================================================
const passed = results.filter(r => r.passed).length;
const total = results.length;
console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║          FUNCTIONAL SCORING — GEAR REDUCER          ║");
console.warn("╟──────────────────────────────────────────────────────╢");
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const msg = r.passed ? "" : ` — ${r.failMsg}`;
  console.warn(`║  ${icon} ${r.name}${msg}`);
}
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${passed}/${total} (${Math.round(100*passed/total)}%)`);
console.warn(`║  Center dist: ${centerDist.toFixed(1)}mm  |  Ratio: ${actualRatio.toFixed(2)}:1`);
console.warn("╚══════════════════════════════════════════════════════╝");

return rest;

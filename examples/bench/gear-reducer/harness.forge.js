// Functional test harness for gear-reducer benchmark
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
function dist2(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2); }

// ===========================================================================
// GATES
// ===========================================================================
const partNames = desc.parts.map(p => p.name);
gate("Pinion exists", () => partNames.includes("Pinion"));
gate("Gear exists", () => partNames.includes("Gear"));
gate("Base/frame exists", () => partNames.some(n => /base|frame/i.test(n)));
const driveJ = desc.joints.find(j => j.name === "drive");
const outputJ = desc.joints.find(j => j.name === "output");
gate("drive joint is revolute", () => driveJ && driveJ.type === "revolute");
gate("output joint is revolute", () => outputJ && outputJ.type === "revolute");

const allGatesPass = gateResults.every(g => g.passed);
const rest = allGatesPass ? solution.solve({ drive: 0 }) : null;

// ===========================================================================
// SCORED — functional tests only
// ===========================================================================
if (allGatesPass) {
  const pCenter = bboxCenter(rest.getPart("Pinion"));
  const gCenter = bboxCenter(rest.getPart("Gear"));
  const centerDist = dist2(pCenter, gCenter);
  const pSize = bboxSize(rest.getPart("Pinion"));
  const gSize = bboxSize(rest.getPart("Gear"));
  // Estimate pitch radii from part sizes (XY diameter / 2)
  const pRadius = Math.max(pSize[0], pSize[1]) / 2;
  const gRadius = Math.max(gSize[0], gSize[1]) / 2;
  const expectedCenterDist = pRadius + gRadius;

  // F1: Gears are close enough to mesh
  // Center distance should match sum of apparent radii within 20%
  const distError = Math.abs(centerDist - expectedCenterDist) / Math.max(expectedCenterDist, 1);
  test("F1: Gears close enough to mesh (center dist matches radii ±20%)",
    () => distError < 0.20,
    `Center dist=${centerDist.toFixed(1)}mm, expected≈${expectedCenterDist.toFixed(1)}mm (${(distError*100).toFixed(0)}% off)`
  );

  // F2: Gear ratio is correct — drive=90 → output≈-30
  let outputAngle = 0;
  try {
    const at90 = asm.solve({ drive: 90 });
    const state = at90.getJointState();
    outputAngle = state.output || 0;
  } catch (e) { /* will fail test */ }
  test("F2: Gear ratio 3:1 (drive=90 → output≈-30)",
    () => Math.abs(outputAngle - (-30)) < 6,
    `Output=${outputAngle.toFixed(1)}° (expected ≈-30°)`
  );

  // F3: Gear is larger than pinion (it's a reducer)
  test("F3: Gear larger than Pinion",
    () => gRadius > pRadius * 1.5,
    `Pinion r=${pRadius.toFixed(1)}, Gear r=${gRadius.toFixed(1)} — gear should be ≥1.5x larger`
  );

  // F4: No major collision at rest (small overlap OK — meshing teeth touch)
  try {
    const collisions = rest.collisionReport({ minOverlapVolume: 50 });
    const gearCollisions = collisions.filter(c =>
      (c.partA === "Pinion" && c.partB === "Gear") || (c.partA === "Gear" && c.partB === "Pinion")
    );
    test("F4: Gears don't heavily collide at rest (< 50mm3 overlap OK)",
      () => gearCollisions.length === 0,
      `${gearCollisions.length} major collision(s)`
    );
  } catch (e) {
    test("F4: No major collision at rest", () => false, e.message);
  }

  // F5: Both gears have round-ish cross section (not boxes pretending to be gears)
  // Check XY aspect ratio — a gear should be roughly circular
  const pAspect = Math.max(pSize[0], pSize[1]) / Math.max(Math.min(pSize[0], pSize[1]), 0.1);
  const gAspect = Math.max(gSize[0], gSize[1]) / Math.max(Math.min(gSize[0], gSize[1]), 0.1);
  test("F5: Both gears are round (XY aspect < 1.5)",
    () => pAspect < 1.5 && gAspect < 1.5,
    `Pinion aspect=${pAspect.toFixed(2)}, Gear aspect=${gAspect.toFixed(2)}`
  );

  // F6: Gears rotate around parallel axes (both primarily Z-axis)
  // Check that both gears are thin in Z compared to XY (disc-shaped)
  const pZRatio = pSize[2] / Math.max(pSize[0], pSize[1], 0.1);
  const gZRatio = gSize[2] / Math.max(gSize[0], gSize[1], 0.1);
  test("F6: Gears are disc-shaped (thin in Z)",
    () => pZRatio < 0.5 && gZRatio < 0.5,
    `Pinion Z/XY=${pZRatio.toFixed(2)}, Gear Z/XY=${gZRatio.toFixed(2)}`
  );
}

// ===========================================================================
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║          FUNCTIONAL SCORING — GEAR REDUCER          ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed ? "✓" : "✗"} ${g.name}${g.passed ? "" : ` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed ? "✓" : "✗"} ${r.name}${r.passed ? "" : ` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return rest || solution.solve({});

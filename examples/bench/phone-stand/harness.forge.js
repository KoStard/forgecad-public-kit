// Functional test harness for phone-stand benchmark
// GATE/SCORE pattern: gates are preconditions (0 points, any fail = 0% total)
// Only functional tests determine the score.

const solution = importAssembly("./solution.forge.js");
const desc = solution.assembly.describe();

// ---------------------------------------------------------------------------
// Scoring infrastructure
// ---------------------------------------------------------------------------
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

function bboxSize(s) { const b = s.boundingBox(); return [b.max[0]-b.min[0], b.max[1]-b.min[1], b.max[2]-b.min[2]]; }
function bboxOverlap(a, b) {
  // Returns [overlapX, overlapY, overlapZ] — positive = overlap, negative = gap
  return [0,1,2].map(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
}

// ===========================================================================
// GATES — structural preconditions (any fail = 0% total score)
// ===========================================================================
const partNames = desc.parts.map(p => p.name);
gate("Base part exists", () => partNames.includes("Base"));
gate("Support part exists", () => partNames.includes("Support"));
gate("mount joint exists", () => desc.joints.some(j => j.name === "mount"));

const allGatesPass = gateResults.every(g => g.passed);
const solved = allGatesPass ? solution.solve({}) : null;

// ===========================================================================
// SCORED TESTS — only these determine the percentage
// ===========================================================================
if (allGatesPass) {
  const baseBB = solved.getPart("Base").boundingBox();
  const supportBB = solved.getPart("Support").boundingBox();
  const baseSize = bboxSize(solved.getPart("Base"));
  const supportSize = bboxSize(solved.getPart("Support"));
  const overlap = bboxOverlap(baseBB, supportBB);

  // F1: Support PHYSICALLY TOUCHES the Base
  // Their bounding boxes must overlap or be within 2mm in at least the vertical axis
  // AND overlap in at least one horizontal axis
  const verticalContact = overlap[2] > -2; // Z overlap or tiny gap
  const horizontalContact = overlap[0] > 0 || overlap[1] > 0; // XY overlap
  test("F1: Support touches Base (physical contact)",
    () => verticalContact && horizontalContact,
    `Overlap XYZ: [${overlap.map(v => v.toFixed(1)).join(", ")}]mm — parts don't touch`
  );

  // F2: Base sits flat on ground plane
  test("F2: Base sits flat (min Z within 2mm of 0)",
    () => Math.abs(baseBB.min[2]) < 2,
    `Base min Z = ${baseBB.min[2].toFixed(1)}mm`
  );

  // F3: Support creates an angled surface — not vertical, not horizontal
  // Check support's Z extent vs horizontal extent ratio
  const supportMaxHoriz = Math.max(supportSize[0], supportSize[1]);
  const supportAngleRatio = supportSize[2] / Math.max(supportMaxHoriz, 0.1);
  test("F3: Support is angled (Z/horiz ratio 0.3-3.0)",
    () => supportAngleRatio > 0.3 && supportAngleRatio < 3.0,
    `Ratio = ${supportAngleRatio.toFixed(2)} — ${supportAngleRatio < 0.3 ? "too flat" : "too vertical"}`
  );

  // F4: Support reaches meaningful height above base top
  const baseTopZ = baseBB.max[2];
  const supportTopZ = supportBB.max[2];
  test("F4: Support reaches 60mm above Base top",
    () => (supportTopZ - baseTopZ) > 60,
    `Only ${(supportTopZ - baseTopZ).toFixed(0)}mm above Base`
  );

  // F5: There's a ledge/lip at the bottom of the support where a phone would rest
  // The support's bottom edge should be near the base top, creating a resting point
  // Support min Z should be within 15mm of base top Z
  const supportBottomZ = supportBB.min[2];
  test("F5: Support has a resting ledge near Base top",
    () => Math.abs(supportBottomZ - baseTopZ) < 15,
    `Support bottom Z=${supportBottomZ.toFixed(1)}, Base top Z=${baseTopZ.toFixed(1)} — ${Math.abs(supportBottomZ - baseTopZ).toFixed(0)}mm gap`
  );

  // F6: Base provides stable footprint (wider than tall)
  const baseMaxHoriz = Math.max(baseSize[0], baseSize[1]);
  test("F6: Base wider than tall (stability)",
    () => baseMaxHoriz > baseSize[2] * 2,
    `Base: ${baseMaxHoriz.toFixed(0)}mm wide vs ${baseSize[2].toFixed(0)}mm tall`
  );

  // F7: Assembly fits reasonable envelope
  const totalSize = [0,1,2].map(i =>
    Math.max(baseBB.max[i], supportBB.max[i]) - Math.min(baseBB.min[i], supportBB.min[i])
  );
  test("F7: Fits in 200x200x200mm",
    () => totalSize.every(d => d <= 200),
    `Size: ${totalSize.map(d => d.toFixed(0)).join("x")}mm`
  );
}

// ===========================================================================
// SCORECARD
// ===========================================================================
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 7;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║           FUNCTIONAL SCORING — PHONE STAND          ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) {
  console.warn(`║    ${g.passed ? "✓" : "✗"} ${g.name}${g.passed ? "" : ` — ${g.failMsg}`}`);
}
if (!gatesPassed) {
  console.warn("║  ⚠ GATE FAILED — score is 0%");
}
console.warn("║  SCORED:");
for (const r of testResults) {
  console.warn(`║    ${r.passed ? "✓" : "✗"} ${r.name}${r.passed ? "" : ` — ${r.failMsg}`}`);
}
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return solved || solution.solve({});

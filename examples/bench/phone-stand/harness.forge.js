// Functional test harness for phone-stand benchmark

const solution = importAssembly("./solution.forge.js");
const desc = solution.assembly.describe();

const results = [];
function test(name, check, failMsg) {
  let passed = false;
  try { passed = check(); } catch (e) { failMsg = failMsg || e.message; }
  results.push({ name, passed, failMsg: passed ? null : (failMsg || "failed") });
  verify.that(name, () => passed, failMsg);
}
function bboxSize(shape) {
  const bb = shape.boundingBox();
  return [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];
}

// ===========================================================================
const partNames = desc.parts.map(p => p.name);
test("T1: Base exists", () => partNames.includes("Base"));
test("T2: Support exists", () => partNames.includes("Support"));

const mount = desc.joints.find(j => j.name === "mount");
test("T3: mount joint exists and is fixed",
  () => mount && mount.type === "fixed",
  mount ? `Type is '${mount.type}'` : "No mount joint"
);

const solved = solution.solve({});
const baseBB = solved.getPart("Base").boundingBox();
const supportBB = solved.getPart("Support").boundingBox();

// Stability: base sits on Z=0 (or close)
test("T4: Base sits flat (min Z near 0)",
  () => Math.abs(baseBB.min[2]) < 5,
  `Base min Z = ${baseBB.min[2].toFixed(1)}mm`
);

// Base wider than tall
const baseSize = bboxSize(solved.getPart("Base"));
const baseMaxHoriz = Math.max(baseSize[0], baseSize[1]);
test("T5: Base wider than tall",
  () => baseMaxHoriz > baseSize[2],
  `Base horizontal ${baseMaxHoriz.toFixed(0)}mm vs height ${baseSize[2].toFixed(0)}mm`
);

// Support reaches above base
const baseTopZ = baseBB.max[2];
const supportTopZ = supportBB.max[2];
const supportHeight = supportTopZ - baseTopZ;
test("T6: Support reaches 60mm above Base",
  () => supportHeight > 60,
  `Support only ${supportHeight.toFixed(0)}mm above Base top`
);

// Support is angled (not purely vertical or horizontal)
// Check that support bbox has both horizontal and vertical extent
const supportSize = bboxSize(solved.getPart("Support"));
const supportHoriz = Math.max(supportSize[0], supportSize[1]);
test("T7: Support is angled (has both horiz and vert extent)",
  () => supportHoriz > 10 && supportSize[2] > 30,
  `Support horiz=${supportHoriz.toFixed(0)}mm, vert=${supportSize[2].toFixed(0)}mm`
);

// Fits in 200x200x200
const totalBB = { min: [0,0,0], max: [0,0,0] };
for (let i = 0; i < 3; i++) {
  totalBB.min[i] = Math.min(baseBB.min[i], supportBB.min[i]);
  totalBB.max[i] = Math.max(baseBB.max[i], supportBB.max[i]);
}
const totalSize = [totalBB.max[0]-totalBB.min[0], totalBB.max[1]-totalBB.min[1], totalBB.max[2]-totalBB.min[2]];
test("T8: Fits in 200x200x200mm",
  () => totalSize.every(d => d <= 200),
  `Size: ${totalSize.map(d => d.toFixed(0)).join("x")}mm`
);

// Real geometry
const baseVol = baseSize[0] * baseSize[1] * baseSize[2];
const supportVol = supportSize[0] * supportSize[1] * supportSize[2];
test("T9: Base has geometry (bbox > 500mm3)", () => baseVol > 500, `${baseVol.toFixed(0)}mm3`);
test("T10: Support has geometry (bbox > 500mm3)", () => supportVol > 500, `${supportVol.toFixed(0)}mm3`);

// ===========================================================================
const passed = results.filter(r => r.passed).length;
const total = results.length;
console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║           FUNCTIONAL SCORING — PHONE STAND          ║");
console.warn("╟──────────────────────────────────────────────────────╢");
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const msg = r.passed ? "" : ` — ${r.failMsg}`;
  console.warn(`║  ${icon} ${r.name}${msg}`);
}
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${passed}/${total} (${Math.round(100*passed/total)}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return solved;

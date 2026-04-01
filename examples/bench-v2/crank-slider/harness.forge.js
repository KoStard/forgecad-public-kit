// Crank-slider harness — tests rotation→linear conversion
// Physical realizability: parts must be connected at joints

const solution = importAssembly("./solution.forge.js");
const asm = solution.assembly;
const desc = asm.describe();

const gateResults = [];
const testResults = [];
function gate(n, c, f) { let p=false; try{p=!!c();}catch(e){f=f||e.message;} gateResults.push({name:n,passed:p,failMsg:p?null:(f||"failed")}); }
function test(n, c, f) { let p=false; try{p=!!c();}catch(e){f=f||e.message;} testResults.push({name:n,passed:p,failMsg:p?null:(f||"failed")}); verify.that(n,()=>p,f); }
function bboxCenter(s) { const b=s.boundingBox(); return [(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2]; }
function bboxSize(s) { const b=s.boundingBox(); return [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]]; }
function dist3(a,b) { return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2); }
function bboxOverlap(a,b) { return [0,1,2].map(i=>Math.min(a.max[i],b.max[i])-Math.max(a.min[i],b.min[i])); }

// GATES
const partNames = desc.parts.map(p => p.name);
gate("Crank exists", () => partNames.includes("Crank"));
gate("Rod exists", () => partNames.includes("Rod"));
gate("Slider exists", () => partNames.includes("Slider"));
gate("drive is revolute", () => desc.joints.find(j => j.name === "drive")?.type === "revolute");
gate("slide is prismatic", () => desc.joints.find(j => j.name === "slide")?.type === "prismatic");

const allGatesPass = gateResults.every(g => g.passed);

if (allGatesPass) {
  // F1: Slider reciprocates — measure position at drive=0 and drive=180
  const at0 = solution.solve({ drive: 0 });
  const at180 = solution.solve({ drive: 180 });
  const sliderPos0 = bboxCenter(at0.getPart("Slider"));
  const sliderPos180 = bboxCenter(at180.getPart("Slider"));
  const travel = dist3(sliderPos0, sliderPos180);

  test("F1: Slider reciprocates (travel > 20mm between 0° and 180°)",
    () => travel > 20,
    `Slider travel = ${travel.toFixed(1)}mm`
  );

  // F2: Travel is roughly 2x crank radius (30-50mm for 20mm crank)
  test("F2: Travel ≈ 2x crank radius (25-60mm)",
    () => travel > 25 && travel < 60,
    `Travel = ${travel.toFixed(1)}mm`
  );

  // F3: Crank rotates but Slider moves linearly (primarily 1 axis)
  const sliderDelta = [0,1,2].map(i => Math.abs(sliderPos180[i] - sliderPos0[i]));
  const primaryAxis = sliderDelta.indexOf(Math.max(...sliderDelta));
  const offAxisMotion = sliderDelta.filter((_, i) => i !== primaryAxis);
  test("F3: Slider moves linearly (off-axis motion < 5mm)",
    () => offAxisMotion.every(d => d < 5),
    `Off-axis: ${offAxisMotion.map(d => d.toFixed(1)).join(", ")}mm`
  );

  // F4: Physical connection — Crank and Rod are close at the wrist joint
  const crankBB = at0.getPart("Crank").boundingBox();
  const rodBB = at0.getPart("Rod").boundingBox();
  const crankRodOverlap = bboxOverlap(crankBB, rodBB);
  const crankRodTouch = crankRodOverlap.filter(v => v > -5).length;
  test("F4: Crank and Rod physically connected (touch in 2+ axes)",
    () => crankRodTouch >= 2,
    `Overlap: [${crankRodOverlap.map(v=>v.toFixed(1)).join(", ")}] — ${crankRodTouch}/3 axes`
  );

  // F5: Physical connection — Rod and Slider are close
  const sliderBB = at0.getPart("Slider").boundingBox();
  const rodSliderOverlap = bboxOverlap(rodBB, sliderBB);
  const rodSliderTouch = rodSliderOverlap.filter(v => v > -5).length;
  test("F5: Rod and Slider physically connected (touch in 2+ axes)",
    () => rodSliderTouch >= 2,
    `Overlap: [${rodSliderOverlap.map(v=>v.toFixed(1)).join(", ")}] — ${rodSliderTouch}/3 axes`
  );

  // F6: Rod is elongated (connects crank to slider)
  const rodSize = bboxSize(at0.getPart("Rod"));
  const rodAspect = Math.max(...rodSize) / Math.max(Math.min(...rodSize), 0.1);
  test("F6: Rod is elongated (aspect > 3:1)",
    () => rodAspect > 3,
    `Rod aspect = ${rodAspect.toFixed(1)}:1`
  );
}

// SCORECARD
const gatesPassed = gateResults.every(g => g.passed);
const scored = gatesPassed ? testResults.filter(r => r.passed).length : 0;
const total = gatesPassed ? testResults.length : testResults.length || 6;
const pct = total > 0 ? Math.round(100 * scored / total) : 0;

console.warn("");
console.warn("╔══════════════════════════════════════════════════════╗");
console.warn("║         FUNCTIONAL SCORING — CRANK-SLIDER           ║");
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn("║  GATES:");
for (const g of gateResults) console.warn(`║    ${g.passed?"✓":"✗"} ${g.name}${g.passed?"":` — ${g.failMsg}`}`);
if (!gatesPassed) console.warn("║  ⚠ GATE FAILED — score is 0%");
console.warn("║  SCORED:");
for (const r of testResults) console.warn(`║    ${r.passed?"✓":"✗"} ${r.name}${r.passed?"":` — ${r.failMsg}`}`);
console.warn("╟──────────────────────────────────────────────────────╢");
console.warn(`║  SCORE: ${scored}/${total} (${pct}%)`);
console.warn("╚══════════════════════════════════════════════════════╝");

return at0 || solution.solve({});

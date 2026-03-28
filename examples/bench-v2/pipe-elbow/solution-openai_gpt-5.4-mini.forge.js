const outerR = 15;
const innerR = 12;
const bendR = 40;
const seg = 72;

// Build by sweeping annular cross-sections along two quarter-circle centerlines
function torusQuarter(R, r, zOffset, startDeg, endDeg, steps) {
  let parts = [];
  for (let i = 0; i < steps; i++) {
    const a0 = startDeg + (endDeg - startDeg) * (i / steps);
    const a1 = startDeg + (endDeg - startDeg) * ((i + 1) / steps);

    const mid = (a0 + a1) / 2;
    const da = a1 - a0;
    const arcLen = Math.abs((Math.PI / 180) * da * R);
    const thickness = Math.max(1.2, arcLen + 0.2);

    const x = R * Math.cos((mid * Math.PI) / 180);
    const y = R * Math.sin((mid * Math.PI) / 180);
    const ang = mid - 90;

    const segShape = cylinder(thickness, outerR, outerR, seg, true)
      .rotate(0, 90, 0)
      .translate(x, y, zOffset)
      .rotate(0, 0, ang);
    parts.push(segShape);
  }
  return union(...parts);
}

// Centerline positioned so one leg opens along +X and the other along +Z
// Use a quarter-torus-like chain for the outer and inner boundaries.
const outer = torusQuarter(bendR, outerR, 15, 180, 90, 36);
const inner = torusQuarter(bendR, innerR, 15, 180, 90, 36);

// Add short straight stubs at both ends to ensure clean openings
const stubLen = 18;
const xStub = cylinder(stubLen, outerR, outerR, seg, true)
  .rotate(0, 90, 0)
  .translate(-bendR, 0, 15)
  .translate(-stubLen / 2, 0, 0);

const zStub = cylinder(stubLen, outerR, outerR, seg, true)
  .translate(0, bendR, 15)
  .translate(0, 0, stubLen / 2);

const outerBody = union(outer, xStub, zStub);

const innerX = cylinder(stubLen + 4, innerR, innerR, seg, true)
  .rotate(0, 90, 0)
  .translate(-bendR, 0, 15)
  .translate(-stubLen / 2 - 2, 0, 0);

const innerZ = cylinder(stubLen + 4, innerR, innerR, seg, true)
  .translate(0, bendR, 15)
  .translate(0, 0, stubLen / 2 + 2);

const innerBody = union(inner, innerX, innerZ);

const elbow = difference(outerBody, innerBody);

return elbow;
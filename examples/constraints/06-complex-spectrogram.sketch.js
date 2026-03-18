// Complex spectrogram optical bench — 54 constraints, 31 points
// Demonstrates: nested triangles, case geometry, camera holder, light path
// Expected: orange "over-redundant" (DOF=-4) — some constraints are redundant
// This is the primary stress test for the constraint solver.

const sk = constrainedSketch();

function eqTriangle(p1, p2, p3) {
  const l1 = sk.line(p1, p2);
  const l2 = sk.line(p2, p3);
  const l3 = sk.line(p3, p1);
  sk.equal(l1, l2);
  sk.equal(l1, l3);
  sk.ccw(p1, p2, p3);
  return { points: [p1, p2, p3], lines: [l1, l2, l3], shape: sk.shape([l1, l2, l3]) };
}

function getLine(p1, p2) {
  if (!p1) p1 = sk.point(0, 0);
  if (!p2) p2 = sk.point(0, 1);
  return { points: [p1, p2], line: sk.line(p1, p2) };
}

function getLines(p1, p2, count) {
  const results = [];
  let nextStart = p1;
  for (let i = 0; i < count; i++) {
    const line = i === count - 1 ? getLine(nextStart, p2) : getLine(nextStart);
    nextStart = line.points[1];
    results.push(line);
  }
  sk.ccw(...results.map((obj) => obj.points[0]));
  return results;
}

// Inner prism triangle
const origin = sk.point(0, 0);
sk.fix(origin);
const innerTri = eqTriangle(origin, sk.point(1, 1), sk.point(0, 5));
const outerTri = eqTriangle(sk.point(0, 0), sk.point(1, 1), sk.point(0, 5));
sk.length(innerTri.lines[0], param("prism_side", 22, { unit: "mm" }));
sk.lineDistance(innerTri.lines[0], outerTri.lines[0], -2);
sk.shapeEqualCentroid(innerTri.shape, outerTri.shape);
sk.absoluteAngle(innerTri.lines[0], param("prism_angle", 46, { unit: "deg" }));

// Light leaving point
const llp = sk.point(0, 0);
sk.pointOnLine(llp, innerTri.lines[1]);
sk.pointLineDistance(llp, innerTri.lines[0], param("light_offset", 8.42, { unit: "mm" }));

// Case exterior
const caseExt = getLines(outerTri.points[0], outerTri.points[2], 5);
sk.absoluteAngle(caseExt[0].line, -90);
sk.absoluteAngle(caseExt[1].line, 0);
sk.absoluteAngle(caseExt[2].line, 90);
sk.absoluteAngle(caseExt[3].line, 180);
sk.absoluteAngle(caseExt[4].line, -90);

// Case interior
const intSP = sk.point(0, 0);
sk.pointOnLine(intSP, outerTri.lines[0]);
const intEP = sk.point(0, 0);
sk.pointOnLine(intEP, outerTri.lines[1]);
const caseInt = getLines(intSP, intEP, 5);
for (let i = 0; i < 5; i++) sk.lineDistance(caseExt[i].line, caseInt[i].line, param("wall", 5, { unit: "mm" }));

// Opening
const openP1 = sk.point(0, 0);
const attachMid = sk.point(0, 0);
const openLines = getLines(openP1, openP1, 4);
sk.parallel(openLines[0].line, openLines[2].line);
sk.parallel(openLines[1].line, openLines[3].line);
sk.length(openLines[0].line, param("opening_width", 4, { unit: "mm" }));
sk.perpendicular(openLines[0].line, openLines[1].line);
sk.lineDistance(openLines[0].line, caseInt[2].line, 0);
sk.lineDistance(openLines[2].line, caseExt[2].line, 0);
sk.midpoint(attachMid, openLines[0].line);
sk.midpoint(attachMid, caseInt[2].line);

// Camera holder exterior
const camP1 = sk.point(0, 0);
const camExt = getLines(camP1, camP1, 4);
sk.pointOnLine(camExt[0].points[0], caseInt[3].line);
sk.pointOnLine(camExt[0].points[1], caseInt[3].line);
sk.pointOnLine(camExt[2].points[0], caseInt[1].line);
sk.pointOnLine(camExt[2].points[1], caseInt[1].line);
sk.perpendicular(caseInt[3].line, camExt[1].line);
sk.perpendicular(caseInt[3].line, camExt[3].line);

// Camera holder interior
const camP2 = sk.point(0, 0);
const camInt = getLines(camP2, camP2, 4);
for (let i = 0; i < 4; i++) sk.lineDistance(camExt[i].line, camInt[i].line, param("cam_wall", 2, { unit: "mm" }));
sk.lineDistance(camInt[1].line, camInt[3].line, param("cam_sensor", 2, { unit: "mm" }));
sk.lineDistance(camInt[3].line, caseInt[2].line, param("cam_offset", -14, { unit: "mm" }));
sk.length(camExt[1].line, param("cam_height", 38, { unit: "mm" }));

// Light path
const mp = sk.point(0, 0);
sk.midpoint(mp, camExt[1].line);
const lightLine = getLine(llp, mp);
sk.length(lightLine.line, param("light_path", 21.5, { unit: "mm" }));
sk.perpendicular(lightLine.line, camExt[1].line);

return sk.solve({ iterations: 200, restarts: 12 });

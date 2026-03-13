// Water Bottle — revolve profile with cap
// Demonstrates: revolve, polygon, difference, smoothing, multi-object

const bodyH = param("Body Height", 180, { min: 120, max: 250, unit: "mm" });
const bodyR = param("Body Radius", 35, { min: 25, max: 50, unit: "mm" });
const neckH = param("Neck Height", 30, { min: 15, max: 50, unit: "mm" });
const neckR = param("Neck Radius", 14, { min: 10, max: 25, unit: "mm" });
const wall = param("Wall Thickness", 2, { min: 1, max: 5, unit: "mm" });
const capH = param("Cap Height", 18, { min: 10, max: 30, unit: "mm" });
const shoulderR = param("Shoulder Curve", 20, { min: 5, max: 40, unit: "mm" });

// Outer profile — polygon traced from bottom-center up and around
// Bottom flat → body → shoulder curve → neck
const steps = 12;
const outerPts = [];

// Bottom center
outerPts.push([0, 0]);
// Bottom edge
outerPts.push([bodyR, 0]);
// Body straight up
outerPts.push([bodyR, bodyH - shoulderR]);

// Shoulder curve (quarter circle from body to neck)
for (let i = 0; i <= steps; i++) {
  const t = (i / steps) * Math.PI / 2;
  const x = neckR + (bodyR - neckR) * Math.cos(t);
  const y = bodyH - shoulderR + shoulderR * Math.sin(t);
  outerPts.push([x, y]);
}

// Neck top
outerPts.push([neckR, bodyH + neckH]);
// Back to center at top
outerPts.push([0, bodyH + neckH]);

const outerProfile = polygon(outerPts);
const outerBody = outerProfile.revolve();

// Inner profile — offset inward by wall thickness
const innerPts = [];
const innerBodyR = bodyR - wall;
const innerNeckR = neckR - wall;

innerPts.push([0, wall]); // bottom floor
innerPts.push([innerBodyR, wall]);
innerPts.push([innerBodyR, bodyH - shoulderR]);

for (let i = 0; i <= steps; i++) {
  const t = (i / steps) * Math.PI / 2;
  const x = innerNeckR + (innerBodyR - innerNeckR) * Math.cos(t);
  const y = bodyH - shoulderR + shoulderR * Math.sin(t);
  innerPts.push([x, y]);
}

innerPts.push([innerNeckR, bodyH + neckH + 1]); // extend past top
innerPts.push([0, bodyH + neckH + 1]);

const innerProfile = polygon(innerPts);
const innerBody = innerProfile.revolve();

const bottle = outerBody.subtract(innerBody);

// Thread ridge on neck (simple ring)
const threadZ = bodyH + neckH * 0.3;
const threadRing = cylinder(2, neckR + 1.5, neckR + 1.5)
  .subtract(cylinder(4, neckR - 0.5, neckR - 0.5).translate(0, 0, -1))
  .translate(0, 0, threadZ);

const threadRing2 = cylinder(2, neckR + 1.5, neckR + 1.5)
  .subtract(cylinder(4, neckR - 0.5, neckR - 0.5).translate(0, 0, -1))
  .translate(0, 0, threadZ + 5);

const bottleWithThreads = union(bottle, threadRing, threadRing2);

// Cap — hollow cylinder that sits on top of neck
const capOuterR = neckR + 3;
const capOuter = cylinder(capH, capOuterR, capOuterR);
const capInner = cylinder(capH - 2, neckR + 0.5, neckR + 0.5).translate(0, 0, 2);
const cap = capOuter.subtract(capInner)
  .translate(0, 0, bodyH + neckH);

// Grip ridges on cap (vertical grooves)
const ridgeCount = 24;
const ridges = [];
for (let i = 0; i < ridgeCount; i++) {
  const angle = (i / ridgeCount) * 360;
  const rad = angle * Math.PI / 180;
  const rx = (capOuterR + 0.5) * Math.cos(rad);
  const ry = (capOuterR + 0.5) * Math.sin(rad);
  ridges.push(
    box(1.5, 1.5, capH - 4, true)
      .translate(rx, ry, bodyH + neckH + capH / 2)
  );
}
const capWithGrip = difference(cap, ...ridges);

return [
  { name: "Bottle", shape: bottleWithThreads, color: "#88ccee" },
  { name: "Cap", shape: capWithGrip, color: "#2255aa" },
];

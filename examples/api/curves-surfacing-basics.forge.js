// Curves + Surfacing basics
// Demonstrates reusable APIs for everyday products:
// - spline2d() for smooth section sketches
// - loft() for section-driven solids
// - spline3d() + sweep() for curved tubes/handles/details

const height = param("Bottle Height", 170, { min: 110, max: 260, unit: "mm" });
const bodyW = param("Body Width", 72, { min: 45, max: 110, unit: "mm" });
const bodyD = param("Body Depth", 48, { min: 30, max: 90, unit: "mm" });
const neckW = param("Neck Width", 28, { min: 18, max: 45, unit: "mm" });
const neckD = param("Neck Depth", 24, { min: 14, max: 40, unit: "mm" });
const corner = param("Corner Round", 8, { min: 2, max: 20, unit: "mm" });

const sectionAt = (w, d, pinch = 0) => spline2d([
  [w * 0.5, 0],
  [w * 0.42, d * 0.45],
  [w * 0.2, d * 0.5 + pinch],
  [0, d * 0.52 + pinch],
  [-w * 0.2, d * 0.5 + pinch],
  [-w * 0.42, d * 0.45],
  [-w * 0.5, 0],
  [-w * 0.42, -d * 0.45],
  [-w * 0.2, -d * 0.5 + pinch],
  [0, -d * 0.52 + pinch],
  [w * 0.2, -d * 0.5 + pinch],
  [w * 0.42, -d * 0.45],
], {
  closed: true,
  samplesPerSegment: 10,
  tension: 0.42,
}).offset(corner * 0.08, 'Round');

const z0 = 0;
const z1 = height * 0.25;
const z2 = height * 0.62;
const z3 = height * 0.9;
const z4 = height;

const body = loft(
  [
    sectionAt(bodyW * 0.86, bodyD * 0.84, -2),
    sectionAt(bodyW, bodyD, 0),
    sectionAt(bodyW * 0.92, bodyD * 0.94, 1),
    sectionAt(neckW * 1.25, neckD * 1.2, 0.5),
    sectionAt(neckW, neckD, 0),
  ],
  [z0, z1, z2, z3, z4],
  { edgeLength: 1.1 },
);

// Hollow interior by lofting smaller inner sections.
const wall = 2.4;
const inner = loft(
  [
    sectionAt(bodyW * 0.78, bodyD * 0.76, -2.2),
    sectionAt(bodyW - wall * 2, bodyD - wall * 2, -0.6),
    sectionAt(bodyW * 0.86 - wall * 2, bodyD * 0.88 - wall * 2, 0.2),
    sectionAt(neckW * 1.06 - wall, neckD * 1.06 - wall, 0),
    sectionAt(neckW - wall, neckD - wall, 0),
  ],
  [z0 + 3, z1, z2, z3, z4 + 2],
  { edgeLength: 1.1 },
);

let bottle = body.subtract(inner);

// Curved spout/tube detail using sweep.
const spoutPath = spline3d(
  [
    [0, 0, z4 - 8],
    [12, 0, z4 + 8],
    [26, 0, z4 + 24],
    [36, 0, z4 + 16],
  ],
  { tension: 0.45 },
);
const spout = sweep(circle2d(2.8, 20), spoutPath, {
  samples: 36,
  edgeLength: 0.65,
});

const topCap = circle2d(Math.max(neckW, neckD) * 0.34, 40).extrude(9)
  .translate(0, 0, z4 - 1.5);

return [
  { name: "Bottle Body", shape: bottle.color('#d8e5ec') },
  { name: "Spout", shape: spout.color('#c0ccd4') },
  { name: "Cap", shape: topCap.color('#4f5f70') },
];

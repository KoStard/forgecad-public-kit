// Benchy-style hull concept using reusable curve/surface APIs.
// Not an exact #3DBenchy clone; this shows the modeling workflow:
// sections -> loft hull, sweep rails/chimney, simple superstructure.

const length = param("Length", 92, { min: 60, max: 150, unit: "mm" });
const beam = param("Beam", 42, { min: 24, max: 70, unit: "mm" });
const hullH = param("Hull Height", 34, { min: 18, max: 60, unit: "mm" });
const deckDrop = param("Deck Drop", 6, { min: 2, max: 12, unit: "mm" });

const mkSection = (w, h, keel = 0, chine = 0) => spline2d([
  [w * 0.5, 0],
  [w * 0.45, h * 0.28 + chine],
  [w * 0.25, h * 0.5 + chine],
  [0, h * 0.58 + keel],
  [-w * 0.25, h * 0.5 + chine],
  [-w * 0.45, h * 0.28 + chine],
  [-w * 0.5, 0],
  [-w * 0.45, -h * 0.18],
  [-w * 0.23, -h * 0.32],
  [0, -h * 0.36 - deckDrop],
  [w * 0.23, -h * 0.32],
  [w * 0.45, -h * 0.18],
], {
  closed: true,
  samplesPerSegment: 10,
  tension: 0.45,
});

const z0 = 0;
const z1 = length * 0.22;
const z2 = length * 0.56;
const z3 = length * 0.88;
const z4 = length;

let hull = loft(
  [
    mkSection(beam * 0.52, hullH * 0.72, 2, 1), // stern
    mkSection(beam * 0.94, hullH * 0.95, 3, 1.5),
    mkSection(beam, hullH, 3.5, 1.2),           // max beam
    mkSection(beam * 0.58, hullH * 0.82, 1.5, 0.5),
    mkSection(beam * 0.18, hullH * 0.35, 0, 0), // bow tip
  ],
  [z0, z1, z2, z3, z4],
  { edgeLength: 0.95 },
);
hull = hull.smoothOut(72, 0.28).refine(2);

// Orient hull so length goes along X, beam along Y, height along Z.
hull = hull
  .rotate(0, 90, 0) // Z (loft stations) -> X
  .rotate(90, 0, 0) // Y (section height) -> Z
  .translate(-length * 0.5, 0, hullH * 0.58);

// Deckhouse and cabin
const houseW = beam * 0.48;
const houseD = length * 0.26;
const houseH = hullH * 0.62;
const house = roundedRect(houseW, houseD, 4, true).extrude(houseH)
  .translate(length * 0.04, 0, hullH * 0.82);

const cabinCut = roundedRect(houseW * 0.68, houseD * 0.56, 2.2, true).extrude(houseH * 0.7)
  .translate(length * 0.04, 0, hullH * 1.08);

// Chimney via sweep
const stackPath = spline3d(
  [
    [length * 0.02, 0, hullH * 1.45],
    [length * 0.02, 0, hullH * 1.72],
    [length * 0.08, 0, hullH * 1.84],
  ],
  { tension: 0.5 },
);
const stack = sweep(circle2d(3.8, 26), stackPath, {
  samples: 28,
  edgeLength: 0.55,
});
const stackInner = sweep(circle2d(2.2, 22), stackPath, {
  samples: 28,
  edgeLength: 0.55,
});

const cabin = house.subtract(cabinCut);
const chimney = stack.subtract(stackInner);

return [
  { name: "Hull", shape: hull.color('#ce6f4e') },
  { name: "Cabin", shape: cabin.color('#f0eee9') },
  { name: "Chimney", shape: chimney.color('#3d4854') },
];

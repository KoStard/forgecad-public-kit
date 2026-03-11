// Geometry provenance inspection.
// Run with: forgecad run examples/api/geometry-info.forge.js
// The CLI now prints backend/representation/fidelity/topology for each object.

const base = rectangle(-35, -20, 70, 40).extrude(18).color('#5f7c8a');

const cutter = circle2d(11, 36).extrude(26).translate(0, 0, -4);
const machined = base
  .toShape()
  .subtract(cutter)
  .color('#9eb4bf')
  .translate(0, 72, 0);

const station = (w, d) => spline2d([
  [w * 0.5, 0],
  [w * 0.32, d * 0.46],
  [0, d * 0.55],
  [-w * 0.32, d * 0.46],
  [-w * 0.5, 0],
  [-w * 0.32, -d * 0.46],
  [0, -d * 0.55],
  [w * 0.32, -d * 0.46],
], {
  closed: true,
  samplesPerSegment: 9,
  tension: 0.35,
});

const lofted = loft(
  [
    station(26, 18),
    station(48, 28),
    station(34, 22),
  ],
  [0, 20, 46],
  { edgeLength: 0.85 },
)
  .translate(110, 18, 0)
  .color('#d8b36a');

console.info('Tracked extrude', base.geometryInfo());
console.info('Boolean cut', machined.geometryInfo());
console.info('Lofted body', lofted.geometryInfo());

return [
  { name: 'Tracked Extrude', shape: base },
  { name: 'Boolean Cut', shape: machined },
  { name: 'Lofted Body', shape: lofted },
];

// Standard-library exploded view: staged offsets + per-part direction overrides.

const explodeAmt = param("Explode", 0, { min: 0, max: 36, unit: "mm" });

const base = box(120, 80, 10, true).color('#5f6d7a');
const pedestal = box(70, 40, 20, true).translate(0, 0, 15).color('#6f7f8f');

const motorBody = cylinder(55, 16, 16, 40, true)
  .pointAlong([1, 0, 0])
  .translate(0, 0, 32)
  .color('#8f9eab');
const shaft = cylinder(80, 4, 4, 24, true)
  .pointAlong([1, 0, 0])
  .translate(0, 0, 32)
  .color('#d1d7de');
const rotorCap = cylinder(8, 18, 18, 36, true)
  .pointAlong([1, 0, 0])
  .translate(31, 0, 32)
  .color('#9eacb9');

const boltTemplate = lib.bolt(6, 26).rotate(180, 0, 0).color('#d8dde3');
const bolts = [
  boltTemplate.translate(-45, -25, 10),
  boltTemplate.translate(45, -25, 10),
  boltTemplate.translate(-45, 25, 10),
  boltTemplate.translate(45, 25, 10),
];

const assembly = [
  { name: "Base", shape: base },
  { name: "Pedestal", shape: pedestal, explode: { stage: 0.35, direction: [0, 0, 1] } },
  {
    name: "Drive",
    group: [
      { name: "Motor Body", shape: motorBody },
      { name: "Rotor Cap", shape: rotorCap, explode: { stage: 1.1, direction: [1, 0, 0] } },
      { name: "Shaft", shape: shaft },
    ],
  },
  {
    name: "Fasteners",
    group: bolts.map((b, i) => ({
      name: `Bolt ${i + 1}`,
      shape: b,
      explode: { stage: 0.9, direction: 'z' },
    })),
  },
];

cutPlane("Center Section", [0, 1, 0], 0);

return lib.explode(assembly, {
  amount: explodeAmt,
  stages: [0.35, 0.7, 1.0],
  mode: 'radial',
  byName: {
    "Shaft": { direction: [1, 0, 0], stage: 1.4 },
    "Fasteners": { axisLock: 'z', stage: 0.45 },
  },
});

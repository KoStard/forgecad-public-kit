// Runtime joints demo
// Move the "Joints" sliders in the View Panel for smooth articulation,
// or use the Animation controls (play/pause + scrub), all without recompute.
// Demonstrates linked joints via couplings (Ankle is driven by Hip + Knee).

const body = box(150, 70, 36, true).translate(0, 0, 40).color('#6e7b88');

const upperLen = 84;
const lowerLen = 86;
const footLen = 48;

const upper = box(upperLen, 18, 18).translate(0, -9, -9).color('#7da2d6');
const lower = box(lowerLen, 16, 16).translate(0, -8, -8).color('#8db3e4');
const foot = box(footLen, 24, 10, true).translate(footLen * 0.5 - 8, 0, -10).color('#9dbfe8');

const leg = assembly('Leg Runtime Demo')
  .addPart('Body', body)
  .addPart('Upper Leg', upper)
  .addPart('Lower Leg', lower)
  .addPart('Foot', foot)
  .addRevolute('hip', 'Body', 'Upper Leg', {
    axis: [0, -1, 0],
    frame: Transform.identity().translate(34, 24, 40),
  })
  .addRevolute('knee', 'Upper Leg', 'Lower Leg', {
    axis: [0, -1, 0],
    frame: Transform.identity().translate(upperLen, 0, 0),
  })
  .addRevolute('ankle', 'Lower Leg', 'Foot', {
    axis: [0, -1, 0],
    frame: Transform.identity().translate(lowerLen, 0, 0),
  });

const solved = leg.solve({
  hip: 0,
  knee: 0,
  ankle: 0,
});

viewConfig({
  jointOverlay: {
    axisColor: '#13dfff',
    arcColor: '#ff7a1a',
    zeroColor: '#ffe26a',
    axisArrowLengthScale: 0.16,
    axisArrowRadiusScale: 0.052,
    arcArrowLengthScale: 0.12,
    arcArrowRadiusScale: 0.038,
    arcLineRadiusScale: 0.02,
  },
});

jointsView({
  joints: [
    {
      name: 'Hip',
      child: 'Upper Leg',
      parent: 'Body',
      type: 'revolute',
      axis: [0, -1, 0],
      pivot: [34, 24, 40],
      min: -50,
      max: 80,
      default: 10,
    },
    {
      name: 'Knee',
      child: 'Lower Leg',
      parent: 'Upper Leg',
      type: 'revolute',
      axis: [0, -1, 0],
      pivot: [34 + upperLen, 24, 40],
      min: -5,
      max: 125,
      default: 40,
    },
    {
      name: 'Ankle',
      child: 'Foot',
      parent: 'Lower Leg',
      type: 'revolute',
      axis: [0, -1, 0],
      pivot: [34 + upperLen + lowerLen, 24, 40],
      min: -40,
      max: 55,
      default: -10,
    },
  ],
  couplings: [
    {
      joint: 'Ankle',
      terms: [
        { joint: 'Knee', ratio: -0.35 },
        { joint: 'Hip', ratio: 0.18 },
      ],
      offset: 6,
    },
  ],
  animations: [
    {
      name: 'Step',
      duration: 1.8,
      loop: true,
      keyframes: [
        { values: { Hip: 18, Knee: 42 } },
        { values: { Hip: -20, Knee: 22 } },
        { values: { Hip: 8, Knee: 86 } },
        { values: { Hip: 24, Knee: 34 } },
        { values: { Hip: 18, Knee: 42 } },
      ],
    },
  ],
  defaultAnimation: 'Step',
});

return solved;

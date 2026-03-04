// Bevel + face gear demo with runtime joint couplings.
// Use the "Joints" section in the View Panel to drive both stages.

const moduleSize = param("Module", 1.4, { min: 0.8, max: 3.0, step: 0.05 });
const bevelInput = param("Bevel Driver", 30, { min: -360, max: 360, step: 1, unit: "°" });
const faceInput = param("Face Driver", 20, { min: -360, max: 360, step: 1, unit: "°" });
const shaftAngle = param("Bevel Shaft", 90, { min: 60, max: 120, step: 1, unit: "°" });

const bevelStage = lib.bevelGearPair({
  pinion: {
    module: moduleSize,
    teeth: 16,
    faceWidth: 10,
    boreDiameter: 5,
  },
  gear: {
    module: moduleSize,
    teeth: 32,
    faceWidth: 9,
    boreDiameter: 8,
  },
  shaftAngleDeg: shaftAngle,
  place: true,
});

const faceStage = lib.faceGearPair({
  pinion: {
    module: moduleSize,
    teeth: 14,
    faceWidth: 8,
    boreDiameter: 5,
  },
  gear: {
    module: moduleSize,
    teeth: 44,
    faceWidth: 7,
    toothHeight: moduleSize * 0.9,
    boreDiameter: 10,
  },
  place: true,
});

for (const d of [...bevelStage.diagnostics, ...faceStage.diagnostics]) {
  const tag = `[${d.level}] ${d.code}`;
  if (d.level === "error") console.error(tag, d.message);
  else if (d.level === "warn") console.warn(tag, d.message);
  else console.info(tag, d.message);
}

const addOffset = (point, offset) => [
  point[0] + offset[0],
  point[1] + offset[1],
  point[2] + offset[2],
];

const bevelOffset = [-110, 0, 0];
const faceOffset = [110, 0, 0];

const bevelPinionPivot = addOffset(bevelStage.pinionCenter, bevelOffset);
const bevelGearPivot = addOffset(bevelStage.gearCenter, bevelOffset);
const facePinionPivot = addOffset(faceStage.pinionCenter, faceOffset);
const faceGearPivot = addOffset(faceStage.gearCenter, faceOffset);

jointsView({
  joints: [
    {
      name: "Bevel Driver",
      child: "Bevel Pinion",
      type: "revolute",
      axis: bevelStage.pinionAxis,
      pivot: bevelPinionPivot,
      min: -1080,
      max: 1080,
      default: bevelInput,
      unit: "°",
    },
    {
      name: "Bevel Driven",
      child: "Bevel Gear",
      type: "revolute",
      axis: bevelStage.gearAxis,
      pivot: bevelGearPivot,
      min: -1080,
      max: 1080,
      default: 0,
      unit: "°",
    },
    {
      name: "Face Driver",
      child: "Face Pinion",
      type: "revolute",
      axis: faceStage.pinionAxis,
      pivot: facePinionPivot,
      min: -1080,
      max: 1080,
      default: faceInput,
      unit: "°",
    },
    {
      name: "Face Driven",
      child: "Face Gear",
      type: "revolute",
      axis: faceStage.gearAxis,
      pivot: faceGearPivot,
      min: -1080,
      max: 1080,
      default: 0,
      unit: "°",
    },
  ],
  couplings: [
    {
      joint: "Bevel Driven",
      terms: [{ joint: "Bevel Driver", ratio: bevelStage.jointRatio }],
    },
    {
      joint: "Face Driven",
      terms: [{ joint: "Face Driver", ratio: faceStage.jointRatio }],
    },
  ],
  animations: [
    {
      name: "Dual Spin",
      duration: 2.4,
      loop: true,
      keyframes: [
        { at: 0.0, values: { "Bevel Driver": 0, "Face Driver": 0 } },
        { at: 0.5, values: { "Bevel Driver": 180, "Face Driver": 120 } },
        { at: 1.0, values: { "Bevel Driver": 360, "Face Driver": 240 } },
      ],
    },
  ],
  defaultAnimation: "Dual Spin",
});

return [
  {
    name: "Bevel Pinion",
    shape: bevelStage.pinion.translate(bevelOffset[0], bevelOffset[1], bevelOffset[2]).color("#d7a25e"),
  },
  {
    name: "Bevel Gear",
    shape: bevelStage.gear.translate(bevelOffset[0], bevelOffset[1], bevelOffset[2]).color("#8ea8be"),
  },
  {
    name: "Face Pinion",
    shape: faceStage.pinion.translate(faceOffset[0], faceOffset[1], faceOffset[2]).color("#c98f5a"),
  },
  {
    name: "Face Gear",
    shape: faceStage.gear.translate(faceOffset[0], faceOffset[1], faceOffset[2]).color("#6f8795"),
  },
];

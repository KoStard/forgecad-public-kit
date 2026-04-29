// Belt drive demo: real tangent-loop belt around two pulley pitch circles.

const beltWidth = Param.number("Belt Width", 8, { min: 4, max: 18, unit: "mm" });
const beltThickness = Param.number("Belt Thickness", 2, { min: 0.8, max: 5, unit: "mm" });
const motorPitchR = Param.number("Motor Pitch Radius", 12, { min: 6, max: 28, unit: "mm" });
const outputPitchR = Param.number("Output Pitch Radius", 28, { min: 12, max: 44, unit: "mm" });
const centerDistance = Param.number("Center Distance", 86, { min: 50, max: 140, unit: "mm" });

const drive = lib.beltDrive({
  pulleys: [
    { name: "motor", center: [0, 0], pitchRadius: motorPitchR },
    { name: "output", center: [centerDistance, 0], pitchRadius: outputPitchR },
  ],
  beltWidth,
  beltThickness,
});

const motorPulley = cylinder(beltWidth + 2, Math.max(0.5, motorPitchR - beltThickness / 2), undefined, 96)
  .translate(0, 0, -1)
  .color("#d5a15f");

const outputPulley = cylinder(beltWidth + 2, Math.max(0.5, outputPitchR - beltThickness / 2), undefined, 128)
  .translate(centerDistance, 0, -1)
  .color("#91a7bd");

const pitchTrace = drive.pitchPath
  .extrude(0.25)
  .translate(0, 0, beltWidth + 0.6)
  .color("#55a6ff");

return [
  { name: "Belt", shape: drive.belt.color("#202124") },
  { name: "Motor Pulley", shape: motorPulley },
  { name: "Output Pulley", shape: outputPulley },
  { name: "Pitch Path", shape: pitchTrace },
];

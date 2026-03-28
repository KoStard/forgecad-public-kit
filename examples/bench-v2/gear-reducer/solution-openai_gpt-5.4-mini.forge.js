const moduleSize = 2.0;
const pinionTeeth = 12;
const gearTeeth = 36;
const faceWidth = 8;

const pair = lib.gearPair({
  pinion: { module: moduleSize, teeth: pinionTeeth, faceWidth: faceWidth },
  gear: { module: moduleSize, teeth: gearTeeth, faceWidth: faceWidth },
});

const pinion = pair.pinion.color("#d9d9d9");
const gear = pair.gear.color("#b0b0b0");

const pitchRadiusPinion = (moduleSize * pinionTeeth) / 2;
const pitchRadiusGear = (moduleSize * gearTeeth) / 2;
const centerDistance = pitchRadiusPinion + pitchRadiusGear;

const baseThickness = 8;
const baseMargin = 12;
const baseWidth = centerDistance + pitchRadiusGear + baseMargin;
const baseDepth = 40;

const base = box(baseWidth, baseDepth, baseThickness, true).translate(centerDistance / 2, 0, -baseThickness / 2 - faceWidth / 2 - 2).color("#666666");

const asm = assembly("GearReducer");
asm.addPart("Base", base, { fixed: true });
asm.addPart("Pinion", pinion, {
  frame: Transform.identity().translate(0, 0, 0),
});
asm.addPart("Gear", gear, {
  frame: Transform.identity().translate(centerDistance, 0, 0),
});

asm.addRevolute("drive", "Base", "Pinion", {
  axis: [0, 0, 1],
  frame: Transform.identity().translate(0, 0, 0),
});

asm.addRevolute("output", "Base", "Gear", {
  axis: [0, 0, 1],
  frame: Transform.identity().translate(centerDistance, 0, 0),
});

asm.addGearCoupling("output", "drive", { pair });

return asm;
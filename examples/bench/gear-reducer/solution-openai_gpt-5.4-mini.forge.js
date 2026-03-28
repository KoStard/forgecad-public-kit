const m = 2;
const pinionTeeth = 10;
const gearTeeth = 30;
const faceWidth = 8;

const pair = lib.gearPair({
  pinion: { module: m, teeth: pinionTeeth, faceWidth: faceWidth },
  gear: { module: m, teeth: gearTeeth, faceWidth: faceWidth },
});

const pinion = pair.pinion.color("#d9d9d9");
const gear = pair.gear.color("#b0b0b0");

const pitchRadiusPinion = (m * pinionTeeth) / 2;
const pitchRadiusGear = (m * gearTeeth) / 2;
const centerDistance = pitchRadiusPinion + pitchRadiusGear;

const base = box(centerDistance + 40, 30, 10, true)
  .translate(centerDistance / 2, 0, -12)
  .color("#808080");

const a = assembly("Gear Reducer");
a.addPart("Base", base);
a.addPart("Pinion", pinion.translate(0, 0, 0));
a.addPart("Gear", gear.translate(centerDistance, 0, 0));

a.addRevolute("drive", "Base", "Pinion", {
  axis: [0, 0, 1],
  default: 0,
  frame: Transform.identity().translate(0, 0, -8),
});

a.addRevolute("output", "Base", "Gear", {
  axis: [0, 0, 1],
  default: 0,
  frame: Transform.identity().translate(centerDistance, 0, -8),
});

a.addGearCoupling("output", "drive", { pair });

return a;
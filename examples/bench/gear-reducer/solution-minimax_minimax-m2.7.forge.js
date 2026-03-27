const module = 2;
const pinionTeeth = 10;
const gearTeeth = 30;
const faceWidth = 10;

const pinionRadius = module * pinionTeeth / 2;
const gearRadius = module * gearTeeth / 2;

const pair = lib.gearPair({
  pinion: { module: module, teeth: pinionTeeth, faceWidth: faceWidth },
  gear: { module: module, teeth: gearTeeth, faceWidth: faceWidth },
});

const pinion = pair.pinion;
const gear = pair.gear;

const base = box(100, 80, 10, true).translate(0, 0, -5);

const centerDistance = pinionRadius + gearRadius;

const pinionPos = [-centerDistance / 2, 0, 0];
const gearPos = [centerDistance / 2, 0, 0];

const a = assembly("Gear Reducer")
  .addPart("Base", base)
  .addPart("Pinion", pinion.translate(...pinionPos))
  .addPart("Gear", gear.translate(...gearPos))
  .addRevolute("drive", "Base", "Pinion", { axis: [0, 0, 1], min: -360, max: 360, default: 0 })
  .addRevolute("output", "Base", "Gear", { axis: [0, 0, 1], min: -360, max: 360, default: 0 })
  .addGearCoupling("drive", "output", { pair });

return a;
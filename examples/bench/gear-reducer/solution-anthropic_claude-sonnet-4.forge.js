const module = 2;
const pinionTeeth = 12;
const gearTeeth = 36;
const faceWidth = 10;
const centerDistance = module * (pinionTeeth + gearTeeth) / 2;

const pair = lib.gearPair({
  pinion: { module: module, teeth: pinionTeeth, faceWidth: faceWidth },
  gear: { module: module, teeth: gearTeeth, faceWidth: faceWidth }
});

const pinion = pair.pinion;
const gear = pair.gear;

const base = box(100, 50, 10, true).translate(0, 0, -5);

const asm = assembly("GearReducer")
  .addPart("Base", base)
  .addPart("Pinion", pinion)
  .addPart("Gear", gear)
  .addRevolute("drive", "Base", "Pinion", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(0, 0, 0)
  })
  .addRevolute("output", "Base", "Gear", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(centerDistance, 0, 0)
  })
  .addGearCoupling("output", "drive", { pair });

return asm;
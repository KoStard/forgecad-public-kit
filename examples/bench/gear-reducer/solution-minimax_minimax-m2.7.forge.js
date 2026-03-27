const pair = lib.gearPair({
  pinion: { module: 2, teeth: 20, faceWidth: 15 },
  gear:   { module: 2, teeth: 60, faceWidth: 15 },
});

const pinionRadius = 20;
const gearRadius = 60;
const centerDistance = pinionRadius + gearRadius;

const base = box(200, 120, 15, true).translate(0, 0, -7.5);

const a = assembly("Gear Reducer")
  .addPart("Base", base)
  .addPart("Pinion", pair.pinion.translate(-centerDistance/2, 0, 0))
  .addPart("Gear", pair.gear.translate(centerDistance/2, 0, 0))
  .addRevolute("drive", "Base", "Pinion", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(-centerDistance/2, 0, 0),
  })
  .addRevolute("output", "Base", "Gear", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(centerDistance/2, 0, 0),
  })
  .addGearCoupling("output", "drive", { pair });

return a;
// Expert solution: 3:1 spur gear reducer
// lib.gearPair() pre-positions gear at (cd,0,0). We must undo that
// because the assembly joint frame handles positioning.

const mod = 2;
const pTeeth = 14;
const gTeeth = 42; // 42/14 = 3:1
const faceW = 10;

const pair = lib.gearPair({
  pinion: { module: mod, teeth: pTeeth, faceWidth: faceW },
  gear:   { module: mod, teeth: gTeeth, faceWidth: faceW },
});

const pR = mod * pTeeth / 2; // 14mm
const gR = mod * gTeeth / 2; // 42mm
const cd = pR + gR;          // 56mm

const base = box(cd + 40, 60, 8, true).translate(cd / 2, 0, -4).color("#666");

// Pinion: already centered at origin — good
// Gear: pre-positioned at (cd, 0, 0) by gearPair — translate back to origin
const gearAtOrigin = pair.gear.translate(-cd, 0, 0);

return assembly("Gear Reducer")
  .addPart("Base", base)
  .addPart("Pinion", pair.pinion)
  .addPart("Gear", gearAtOrigin)
  .addRevolute("drive", "Base", "Pinion", {
    axis: [0, 0, 1],
    frame: Transform.identity(),
  })
  .addRevolute("output", "Base", "Gear", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(cd, 0, 0),
  })
  .addGearCoupling("output", "drive", { pair });

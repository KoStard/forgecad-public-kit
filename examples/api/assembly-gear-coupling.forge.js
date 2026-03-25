// Assembly + gear coupling demo
// Uses addGearCoupling(...) so the driven joint follows pinion motion automatically.

const pinionDeg = param("Pinion Angle", 20, { min: -180, max: 180, step: 1, unit: "°" });

const pair = lib.gearPair({
  pinion: { module: 1.25, teeth: 14, faceWidth: 8, boreDiameter: 5 },
  gear: { module: 1.25, teeth: 42, faceWidth: 8, boreDiameter: 8 },
  backlash: 0.05,
  place: false,
});

const mech = assembly("Gear Coupling Demo")
  .addFrame("Base")
  .addPart("Pinion", pair.pinion.color("#d5a15f"))
  .addPart("Driven", pair.gear.color("#9ab3ca"), {
    transform: Transform.identity().translate(pair.centerDistance, 0, 0),
  })
  .addRevolute("Pinion", "Base", "Pinion", {
    axis: [0, 0, 1],
    min: -720,
    max: 720,
  })
  .addRevolute("Driven", "Base", "Driven", {
    axis: [0, 0, 1],
    min: -720,
    max: 720,
  })
  .addGearCoupling("Driven", "Pinion", { pair });

const solved = mech.solve({ Pinion: pinionDeg });
return solved;

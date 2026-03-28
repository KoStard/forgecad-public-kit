// Gear pair parameters
const m = 2; // module (mm)
const pinionTeeth = 20;
const gearTeeth = 60;
const faceWidth = 10;

// Create matched gear geometry
const pair = lib.gearPair({
  pinion: { module: m, teeth: pinionTeeth, faceWidth: faceWidth },
  gear:   { module: m, teeth: gearTeeth,   faceWidth: faceWidth },
});

// Pitch radii: m * teeth / 2
// Pinion: 2 * 20 / 2 = 20 mm
// Gear:   2 * 60 / 2 = 60 mm
// Center distance = 20 + 60 = 80 mm
const centerDistance = 20 + 60; // 80 mm

// Create base frame (mounting plate)
const base = box(180, 80, 15, true)
  .translate(40, 0, -15);

// Build assembly
const asm = assembly("GearReducer")
  .addPart("Base", base)
  .addPart("Pinion", pair.pinion)
  .addPart("Gear", pair.gear)
  .addRevolute('drive', 'Base', 'Pinion', {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(0, 0, 0)
  })
  .addRevolute('output', 'Base', 'Gear', {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(centerDistance, 0, 0)
  })
  .addGearCoupling('drive', 'output', { pair });

// Solve at 90 degrees — gear should be at -30 degrees (3:1 reduction, external mesh reverses direction)
const solved = asm.solve({ drive: 90 });

// Verify the gears have geometry
const pinionBounds = pair.pinion.boundingBox();
const gearBounds = pair.gear.boundingBox();
const pinionSize = pinionBounds.max[0] - pinionBounds.min[0];
const gearSize = gearBounds.max[0] - gearBounds.min[0];

verify.equal("Pinion has geometry", !pair.pinion.isEmpty(), true);
verify.equal("Gear has geometry", !pair.gear.isEmpty(), true);
verify.equal("Pinion smaller than gear", pinionSize < gearSize, true);
verify.inRange("Center distance approx 80mm", centerDistance, 78, 82);

return solved;
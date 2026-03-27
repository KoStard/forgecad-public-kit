const module = 2;            // Module size (mm)
const pinionTeeth = 12;      // Pinion teeth count
const gearTeeth = 36;        // Gear teeth count (3x pinion for 3:1 ratio)
const faceWidth = 10;        // Gear face width (mm)

// Create gear pair geometry using library
const pair = lib.gearPair({
  pinion: { module, teeth: pinionTeeth, faceWidth },
  gear: { module, teeth: gearTeeth, faceWidth },
});

// Create base frame as a box centered at origin
const base = box(80, 40, 10, true).color("#888888");

// Calculate center distance between gears
const centerDistance = (pinionTeeth + gearTeeth) * module / 2;

// Position pinion at origin on base
const pinionShape = pair.pinion.translate(0, 0, faceWidth / 2);
// Position gear at centerDistance along X axis, same height
const gearShape = pair.gear.translate(centerDistance, 0, faceWidth / 2);

// Create assembly
const assembly = assembly("GearReducer")
  .addPart("Base", base)
  .addPart("Pinion", pinionShape)
  .addPart("Gear", gearShape)
  // Revolute joint for Pinion on Base at pinion center (0,0,faceWidth/2)
  .addRevolute("drive", "Base", "Pinion", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(0, 0, faceWidth / 2),
    min: -360,
    max: 360,
    default: 0,
  })
  // Revolute joint for Gear on Base at gear center (centerDistance,0,faceWidth/2)
  .addRevolute("output", "Base", "Gear", {
    axis: [0, 0, 1],
    frame: Transform.identity().translate(centerDistance, 0, faceWidth / 2),
    min: -360,
    max: 360,
    default: 0,
  })
  // Add gear coupling to link drive and output joints with correct ratio
  .addGearCoupling("output", "drive", { pair });

// Return the assembly
return assembly;
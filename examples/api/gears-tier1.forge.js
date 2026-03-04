// Tier 1 gears demo: spur pair + ring gear + rack gear

const moduleSize = param("Module", 1.25, { min: 0.6, max: 3.0, step: 0.05 });
const pinionTeeth = param("Pinion Teeth", 14, { min: 8, max: 28, integer: true });
const drivenTeeth = param("Driven Teeth", 42, { min: 16, max: 90, integer: true });
const backlash = param("Backlash", 0.05, { min: 0, max: 0.2, step: 0.01, unit: "mm" });
const faceWidth = param("Face Width", 10, { min: 4, max: 18, unit: "mm" });

const pair = lib.gearPair({
  pinion: {
    module: moduleSize,
    teeth: pinionTeeth,
    pressureAngleDeg: 20,
    faceWidth,
    boreDiameter: 5,
  },
  gear: {
    module: moduleSize,
    teeth: drivenTeeth,
    pressureAngleDeg: 20,
    faceWidth,
    boreDiameter: 8,
  },
  backlash,
});

for (const d of pair.diagnostics) {
  const tag = `[${d.level}] ${d.code}`;
  if (d.level === "error") console.error(tag, d.message);
  else if (d.level === "warn") console.warn(tag, d.message);
  else console.info(tag, d.message);
}

const ring = lib.ringGear({
  module: moduleSize,
  teeth: Math.max(30, drivenTeeth + pinionTeeth + 4),
  pressureAngleDeg: 20,
  faceWidth,
  backlash,
  rimWidth: moduleSize * 3,
}).translate(0, 95, 0);

const rack = lib.rackGear({
  module: moduleSize,
  teeth: 22,
  pressureAngleDeg: 20,
  faceWidth,
  backlash,
  baseHeight: moduleSize * 2,
}).translate(0, -95, 0);

return [
  { name: "Spur Pinion", shape: pair.pinion.color("#d5a15f") },
  { name: "Spur Gear", shape: pair.gear.color("#9ab3ca") },
  { name: "Ring Gear", shape: ring.color("#71808d") },
  { name: "Rack Gear", shape: rack.color("#6f9272") },
];

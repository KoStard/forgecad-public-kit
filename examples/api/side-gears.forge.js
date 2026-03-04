// Side/crown gear demo: teeth on one face + perpendicular vertical spur gear.

const moduleSize = param("Module", 1.25, { min: 0.6, max: 3.0, step: 0.05 });
const sideTeeth = param("Side Teeth", 36, { min: 18, max: 84, integer: true });
const verticalTeeth = param("Vertical Teeth", 12, { min: 8, max: 30, integer: true });
const faceWidth = param("Face Width", 8, { min: 4, max: 18, unit: "mm" });
const toothHeight = param("Side Tooth Height", 1.25, { min: 0.4, max: 3.5, step: 0.05, unit: "mm" });
const backlash = param("Backlash", 0.04, { min: 0, max: 0.2, step: 0.01, unit: "mm" });
const topSide = param("Top Teeth (1/0)", 1, { min: 0, max: 1, integer: true });

const pair = lib.sideGearPair({
  side: {
    module: moduleSize,
    teeth: sideTeeth,
    pressureAngleDeg: 20,
    faceWidth,
    toothHeight,
    side: topSide === 0 ? "bottom" : "top",
    boreDiameter: moduleSize * 5,
  },
  vertical: {
    module: moduleSize,
    teeth: verticalTeeth,
    pressureAngleDeg: 20,
    faceWidth,
    boreDiameter: moduleSize * 3,
  },
  backlash,
});

for (const d of pair.diagnostics) {
  const tag = `[${d.level}] ${d.code}`;
  if (d.level === "error") console.error(tag, d.message);
  else if (d.level === "warn") console.warn(tag, d.message);
  else console.info(tag, d.message);
}

const sideColor = pair.status === "error" ? "#bf4b4b" : "#8aa8c2";
const verticalColor = pair.status === "error" ? "#c58b5d" : "#d5a15f";

return [
  { name: "Side Gear", shape: pair.side.color(sideColor) },
  { name: "Vertical Gear", shape: pair.vertical.color(verticalColor) },
];

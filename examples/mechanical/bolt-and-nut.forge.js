// Bolt and Nut — helical threads via twisted extrusion
//
// lib.bolt() and lib.nut() use Manifold's native extrude+twist
// to sweep a thread tooth profile helically — clean geometry, no SDF grid.

const diameter = Param.number("Diameter", 8, { min: 4, max: 20, unit: "mm" });
const length = Param.number("Length", 30, { min: 10, max: 60, unit: "mm" });
const pitch = Param.number("Pitch", 1.25, { min: 0.5, max: 3, step: 0.25, unit: "mm" });
const headH = Param.number("Head Height", 5, { min: 3, max: 12, unit: "mm" });
const headAF = Param.number("Head AF", 13, { min: 7, max: 30, unit: "mm" });
const nutHeight = Param.number("Nut Height", 6.5, { min: 3, max: 12, unit: "mm" });
const nutAF = Param.number("Nut AF", 13, { min: 7, max: 30, unit: "mm" });
const showNut = Param.number("Show Nut", 1, { min: 0, max: 1, step: 1 });
const nutPos = Param.number("Nut Position", 5, { min: 0, max: 30, unit: "mm" });
const segments = Param.number("Segments", 36, { min: 12, max: 72, step: 4, integer: true });

const boltShape = lib.bolt(diameter, length, {
  pitch,
  headHeight: headH,
  headAcrossFlats: headAF,
  segments,
});

const result = [
  { name: "Bolt", shape: boltShape, color: "#aaaaaa" },
];

if (showNut >= 1) {
  const nutShape = lib.nut(diameter, {
    pitch,
    height: nutHeight,
    acrossFlats: nutAF,
    segments,
  }).translate(0, 0, -length + nutPos + nutHeight / 2);

  result.push({ name: "Nut", shape: nutShape, color: "#999999" });
}

return result;

// Bolt and Nut — helical threads via twisted extrusion
//
// lib.bolt() and lib.nut() use Manifold's native extrude+twist
// to sweep a thread tooth profile helically — clean geometry, no SDF grid.

const diameter = param("Diameter", 8, { min: 4, max: 20, unit: "mm" });
const length = param("Length", 30, { min: 10, max: 60, unit: "mm" });
const pitch = param("Pitch", 1.25, { min: 0.5, max: 3, step: 0.25, unit: "mm" });
const headH = param("Head Height", 5, { min: 3, max: 12, unit: "mm" });
const headAF = param("Head AF", 13, { min: 7, max: 30, unit: "mm" });
const nutHeight = param("Nut Height", 6.5, { min: 3, max: 12, unit: "mm" });
const nutAF = param("Nut AF", 13, { min: 7, max: 30, unit: "mm" });
const showNut = param("Show Nut", 1, { min: 0, max: 1, step: 1 });
const nutPos = param("Nut Position", 5, { min: 0, max: 30, unit: "mm" });
const segments = param("Segments", 36, { min: 12, max: 72, step: 4, integer: true });

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

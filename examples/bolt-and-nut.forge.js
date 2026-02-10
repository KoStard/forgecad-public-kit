// Bolt and Nut — real helical threads via lib.thread() SDF
//
// lib.bolt() and lib.nut() use levelSet (signed distance function)
// to generate actual helical geometry — not a visual approximation.

const diameter = param("Diameter", 8, { min: 4, max: 20, unit: "mm" });
const length = param("Length", 30, { min: 10, max: 60, unit: "mm" });
const pitch = param("Pitch", 1.25, { min: 0.5, max: 3, step: 0.25, unit: "mm" });
const headH = param("Head Height", 5, { min: 3, max: 12, unit: "mm" });
const headAF = param("Head AF", 13, { min: 7, max: 30, unit: "mm" });
const nutHeight = param("Nut Height", 6.5, { min: 3, max: 12, unit: "mm" });
const nutAF = param("Nut AF", 13, { min: 7, max: 30, unit: "mm" });
const showNut = param("Show Nut", 1, { min: 0, max: 1, step: 1 });
const nutPos = param("Nut Position", 5, { min: 0, max: 30, unit: "mm" });
const resolution = param("Resolution", 0.5, { min: 0.2, max: 1, step: 0.1, unit: "mm" });

const boltShape = lib.bolt(diameter, length, {
  pitch,
  headHeight: headH,
  headAcrossFlats: headAF,
  edgeLength: resolution,
});

const result = [
  { name: "Bolt", shape: boltShape, color: "#aaaaaa" },
];

if (showNut >= 1) {
  const nutShape = lib.nut(diameter, {
    pitch,
    height: nutHeight,
    acrossFlats: nutAF,
    edgeLength: resolution,
  }).translate(0, 0, -length + nutPos + nutHeight / 2);

  result.push({ name: "Nut", shape: nutShape, color: "#999999" });
}

return result;

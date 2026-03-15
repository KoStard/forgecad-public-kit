// import-group-source.forge.js
// A multipart bracket assembly exported as a named ShapeGroup.
// Import with: importGroup("api/import-group-source.forge.js")

const thickness = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const height    = param("Height",    40, { min: 20, max: 80, unit: "mm" });
const width     = param("Width",     60, { min: 40, max: 120, unit: "mm" });

// Left bracket
const leftBracket = box(thickness, width, height)
  .color('#5b7c8d');

// Right bracket — mirror of left
const rightBracket = box(thickness, width, height)
  .translate(width + thickness, 0, 0)
  .color('#5b7c8d');

// Connecting dowel — runs along Y axis between the two brackets
const dowel = cylinder(width, 3)
  .rotate(90, 0, 0)
  .translate(width / 2 + thickness, width, height / 2)
  .color('#d38b4d');

return group(
  { name: "Bracket Left",  shape: leftBracket },
  { name: "Bracket Right", shape: rightBracket },
  { name: "Dowel",         shape: dowel },
).withReferences({
  points: {
    // Semantic mount point at the center of the left face
    mountCenter: [0, width / 2, height / 2],
    // Top-center of the full assembly
    topCenter:   [width / 2 + thickness, width / 2, height],
  },
});

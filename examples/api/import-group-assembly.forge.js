// import-group-assembly.forge.js
// Demonstrates importGroup(): bring in a multipart component and work on
// the whole group or individual named children separately.

// --- Import the full assembly as a ShapeGroup ---
const bracketAssembly = importGroup("api/import-group-source.forge.js");

// Place it using a named reference (same API as importPart)
const placed = bracketAssembly.placeReference("mountCenter", [0, 0, 0]);

// --- Access individual children by name ---
// Each child is a Shape/TrackedShape/ShapeGroup you can manipulate independently.
const leftBracket  = placed.child("Bracket Left");
const rightBracket = placed.child("Bracket Right");
const dowel        = placed.child("Dowel");

// Make a highlight copy of the left bracket for visualisation
const highlight = leftBracket.color('#ff4444');

// --- A second instance, shifted and with overridden params ---
const secondAssembly = importGroup("api/import-group-source.forge.js", {
  "Height": 60,
  "Width": 80,
}).translate(150, 0, 0);

return [
  // Show the first assembly as individual named parts
  { name: "Left Bracket (highlight)", shape: highlight },
  { name: "Right Bracket",            shape: rightBracket },
  { name: "Dowel",                    shape: dowel },

  // Show the second (translated) assembly as a group
  { name: "Second Assembly",          shape: secondAssembly },
];

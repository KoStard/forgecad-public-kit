const left = require("api/dimensioned-bracket.forge.js", {
  "Width": 55,
  "Height": 45,
  "Depth": 28,
  "Thickness": 4,
}).translate(-80, 0, 0);

const right = require("api/dimensioned-bracket.forge.js", {
  "Width": 55,
  "Height": 45,
  "Depth": 28,
  "Thickness": 4,
}).translate(80, 0, 0).rotate(0, 0, 180);

return [
  { name: "Left Bracket", shape: left, color: "#6a7bd1" },
  { name: "Right Bracket", shape: right, color: "#d18a5a" },
];

const left = require("api/import-args-unit.forge.js", {
  "Width": 24,
  "Height": 24,
  "Depth": 8,
}).translate(-20, 0, 0);

const right = require("api/import-args-unit.forge.js", {
  "Width": 52,
  "Height": 16,
  "Depth": 12,
}).translate(20, 0, 0);

return [
  { name: "Left", shape: left, color: "#5c88da" },
  { name: "Right", shape: right, color: "#d97c45" },
];

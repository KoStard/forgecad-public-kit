// Relative import paths: ./ resolves from this file's folder.

const left = importPart("./import-args-unit.forge.js", {
  "Width": 26,
  "Height": 22,
  "Depth": 9,
}).translate(-24, 0, 0);

const right = importPart("./import-args-unit.forge.js", {
  "Width": 46,
  "Height": 18,
  "Depth": 12,
}).translate(24, 0, 0);

return [
  { name: "Left (./)", shape: left, color: "#5f87c6" },
  { name: "Right (./)", shape: right, color: "#d18a5a" },
];

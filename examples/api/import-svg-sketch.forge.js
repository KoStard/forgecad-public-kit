// SVG import demo:
// - Filled regions (all vs largest only)
// - Stroke-only import

const allFill = importSvgSketch("api/import-svg-sketch-shape.svg", {
  include: "fill",
  regionSelection: "all",
});

const largestFill = importSvgSketch("api/import-svg-sketch-shape.svg", {
  include: "fill",
  regionSelection: "largest",
  maxWidth: 35,
  maxHeight: 35,
  centerOnOrigin: true,
});

const strokeOnly = importSvgSketch("api/import-svg-sketch-shape.svg", {
  include: "stroke",
  flattenTolerance: 0.2,
});

return [
  { name: "Fill (all regions)", shape: allFill.extrude(4).translate(-55, 0, 0).color("#5f87c6") },
  { name: "Fill (largest region)", shape: largestFill.extrude(4).color("#d08f5b") },
  { name: "Stroke geometry", shape: strokeOnly.extrude(4).translate(55, 0, 0).color("#66b38d") },
];

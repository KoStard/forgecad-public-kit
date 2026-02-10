// Lamp Shade profile — trapezoid cross-section for revolution
// Returns a Sketch (revolved by the parent .forge.js)

const topR = param("Top Radius", 15, { min: 8, max: 30, unit: "mm" });
const bottomR = param("Bottom Radius", 30, { min: 15, max: 50, unit: "mm" });
const shadeH = param("Shade Height", 35, { min: 20, max: 60, unit: "mm" });
const wall = param("Wall Thickness", 1.5, { min: 0.5, max: 4, unit: "mm" });

// Outer trapezoid profile (right half for revolution around Y axis)
const outer = polygon([
  [topR, shadeH],
  [bottomR, 0],
  [bottomR, -wall],      // bottom lip thickness
  [topR - wall, shadeH], // inner top
]);

return outer;

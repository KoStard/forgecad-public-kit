// Cup with larger top than bottom

// Parameters
const height = Param.number("Height", 80, { min: 40, max: 150, unit: "mm" });
const topRadius = Param.number("Top Radius", 35, { min: 20, max: 60, unit: "mm" });
const bottomRadius = Param.number("Bottom Radius", 25, { min: 15, max: 50, unit: "mm" });
const wallThickness = Param.number("Wall Thickness", 3, { min: 1, max: 8, unit: "mm" });
const baseThickness = Param.number("Base Thickness", 5, { min: 2, max: 10, unit: "mm" });

// Outer cup shape - tapered cylinder (truncated cone)
const outerCup = cylinder(height, bottomRadius, topRadius);

// Inner hollow shape - slightly smaller, shorter to leave a base
const innerHeight = height - baseThickness;
const innerTopRadius = topRadius - wallThickness;
const innerBottomRadius = bottomRadius - wallThickness;

// Create hollow interior by subtracting inner cone
const innerCup = cylinder(innerHeight, innerBottomRadius, innerTopRadius)
  .translate(0, 0, baseThickness);

// Final cup with hollow interior
const cup = outerCup.subtract(innerCup);

return cup;

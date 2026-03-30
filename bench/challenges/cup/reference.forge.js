// Reference: Simple tapered cup with hollow interior
const height = 80;
const topRadius = 35;
const bottomRadius = 25;
const wallThickness = 3;
const baseThickness = 5;

const outer = cylinder(height, bottomRadius, topRadius);
const inner = cylinder(height - baseThickness, bottomRadius - wallThickness, topRadius - wallThickness)
  .translate(0, 0, baseThickness);

return outer.subtract(inner);

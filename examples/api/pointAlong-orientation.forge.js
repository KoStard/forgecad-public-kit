// pointAlong() — orient a cylinder's axis without thinking about Euler angles.
//
// Cylinders default to Z-up. To lay one along X or Y:
//   ❌ cylinder(80, 5).rotate(90, 0, 0)   — which axis? confusing
//   ✅ cylinder(80, 5).pointAlong([0, 1, 0]) — "point along Y"
//
// After pointAlong, the cylinder starts at origin and extends in that direction.
// Always call pointAlong BEFORE translate/attachTo.

const len = param("Length", 80, { min: 30, max: 150, unit: "mm" });
const r = param("Radius", 5, { min: 2, max: 15, unit: "mm" });
const spacing = 40;

// Default: along +Z (up)
const zCyl = cylinder(len, r).color('#4444cc')
  .translate(0, 0, 0);
const zTip = sphere(r * 1.5).color('#6666ff')
  .translate(0, 0, len);

// Along +X (right)
const xCyl = cylinder(len, r).color('#cc4444')
  .pointAlong([1, 0, 0])
  .translate(0, spacing, 0);
const xTip = sphere(r * 1.5).color('#ff6666')
  .translate(len, spacing, 0);

// Along +Y (forward)
const yCyl = cylinder(len, r).color('#44cc44')
  .pointAlong([0, 1, 0])
  .translate(0, 0, 0)
  .translate(spacing, 0, 0);
const yTip = sphere(r * 1.5).color('#66ff66')
  .translate(spacing, len, 0);

// Along diagonal [1, 1, 1]
const dCyl = cylinder(len, r).color('#cccc44')
  .pointAlong([1, 1, 1])
  .translate(spacing, spacing, 0);
const dLen = len / Math.sqrt(3); // projected length per axis
const dTip = sphere(r * 1.5).color('#ffff66')
  .translate(spacing + dLen, spacing + dLen, dLen);

return [
  { name: "Z-axis (default)", shape: zCyl },
  { name: "Z tip", shape: zTip },
  { name: "X-axis (pointAlong [1,0,0])", shape: xCyl },
  { name: "X tip", shape: xTip },
  { name: "Y-axis (pointAlong [0,1,0])", shape: yCyl },
  { name: "Y tip", shape: yTip },
  { name: "Diagonal (pointAlong [1,1,1])", shape: dCyl },
  { name: "Diagonal tip", shape: dTip },
];

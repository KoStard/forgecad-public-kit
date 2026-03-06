// Exact-exportable subset demo for STEP/BREP.
// Run: npm run step -- examples/api/brep-exportable.forge.js

const plate = rect(120, 80, true).extrude(10).color('#748b99');
const boss = cylinder(24, 18).translate(0, 0, 10).color('#b7c4cc');

const leftHole = cylinder(18, 5).translate(-34, 0, -4);
const rightHole = cylinder(18, 5).translate(34, 0, -4);
const centerBore = cylinder(34, 8).translate(0, 0, 6);

const exactPart = union(plate.toShape(), boss)
  .subtract(leftHole)
  .subtract(rightHole)
  .subtract(centerBore)
  .color('#9db1bd');

return [
  { name: 'Exact Export Demo', shape: exactPart },
];

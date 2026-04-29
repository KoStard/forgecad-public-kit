// Gyroid-diamond blend — shader-compatible TPMS fields combined in one form.
// Return the raw SDF for fast native preview; use toShape(...) when exporting.

const bounds = sdf.sphere(22);
const gyroid = sdf.gyroid({ cellSize: 10, thickness: 1.0 });
const diamond = sdf.diamond({ cellSize: 12, wallThickness: 1.1 }).rotateZ(20);

return gyroid
  .smoothUnion(diamond, 1.5)
  .intersect(bounds)
  .color('#6b4c9a');

// Voronoi sphere — hollow sphere with organic cell walls
// Hero demo for surface pattern SDF features

const shell = sdf.sphere(20).shell(3);
const pattern = sdf.voronoi({ cellSize: 8, wallThickness: 1.5, seed: 42 });

return shell
  .intersect(pattern)
  .toShape({ edgeLength: 0.5 })
  .color('#e8c170');

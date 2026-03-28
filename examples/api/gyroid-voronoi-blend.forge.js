// Gyroid-voronoi blend — two pattern systems combined in one form
// Demonstrates composability of SDF patterns

const bounds = sdf.sphere(22);
const gyroid = sdf.gyroid({ cellSize: 10, thickness: 1.0 });
const voronoi = sdf.voronoi({ cellSize: 12, wallThickness: 1.5, seed: 3 });

return gyroid
  .smoothUnion(voronoi, 1.5)
  .intersect(bounds)
  .toShape({ edgeLength: 0.6 })
  .color('#6b4c9a');

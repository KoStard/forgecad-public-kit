// Nested spheres — three concentric patterned shells forming a magical orb

const outer = sdf.sphere(22).shell(2)
  .intersect(sdf.voronoi({ cellSize: 7, wallThickness: 1.2, seed: 1 }));

const middle = sdf.sphere(16).shell(1.5)
  .intersect(sdf.gyroid({ cellSize: 6, thickness: 1.0 }));

const inner = sdf.sphere(10);

return outer
  .union(middle)
  .union(inner)
  .toShape({ edgeLength: 0.5 })
  .color('#8b5cf6');

// Voronoi lampshade — organic cell-wall dome, open at the bottom

const dome = sdf.sphere(30)
  .subtract(sdf.sphere(27))
  .subtract(sdf.box(70, 70, 35).translate(0, 0, -17));

const cells = sdf.voronoi({ cellSize: 7, wallThickness: 1.4, seed: 42 });

return dome
  .intersect(cells)
  .toShape({ edgeLength: 0.5 })
  .color('#d4a04a');

// Patterned vase — tapered cylinder with voronoi walls
// Shows surface patterns on revolved forms

const vase = sdf.cylinder(40, 15)
  .displace((x, y, z) => -2 * Math.cos(y * 0.08) - 3 * Math.exp(-y * y / 800));

const pattern = sdf.voronoi({ cellSize: 7, wallThickness: 1.2, seed: 7 });

return vase
  .shell(2)
  .intersect(pattern)
  .toShape({ edgeLength: 0.5 })
  .color('#c4785b');

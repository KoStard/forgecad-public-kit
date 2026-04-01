// Twisted lattice tower — gyroid infill spiraling up a tapered column

const column = sdf.cylinder(50, 12)
  .displace((x, y, z) => -2 * Math.exp(-y * y / 1200));

const lattice = sdf.gyroid({ cellSize: 7, thickness: 1.3 });

return lattice
  .intersect(column)
  .twist(3)
  .toShape({ edgeLength: 0.5 })
  .color('#2a8a9e');

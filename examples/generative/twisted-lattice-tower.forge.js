// Twisted lattice tower — gyroid field raymarched directly in the viewport.

const column = sdf.cylinder(54, 13);

const lattice = sdf.gyroid({ cellSize: 7, wallThickness: 1.2 });

return lattice
  .intersect(column)
  .twist(3)
  .color('#2a8a9e');

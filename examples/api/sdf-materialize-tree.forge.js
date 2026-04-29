// Materialize a raw SDF tree when you need mesh-backed CAD/export behavior.

const insert = {
  shell: sdf.sphere(18)
    .shell(2)
    .color('#9be7ff'),
  lattice: sdf.gyroid({ cellSize: 6, wallThickness: 0.8 })
    .intersect(sdf.sphere(17))
    .color('#ffcf5a'),
};

return insert;
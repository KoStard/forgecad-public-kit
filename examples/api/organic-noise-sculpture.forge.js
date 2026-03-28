// Organic noise sculpture — natural, coral-like form
// Demonstrates noise field intersected with geometry

const shell = sdf.sphere(20).shell(4);
const texture = sdf.noise({ scale: 0.15, amplitude: 3, octaves: 3 });

return shell
  .intersect(texture)
  .toShape({ edgeLength: 0.5 })
  .color('#7a9e7e');

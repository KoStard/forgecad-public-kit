// Coral vase — organic noise-textured vessel with natural ridges

const vase = sdf.cylinder(50, 16)
  .displace((x, y, z) => 4 * Math.sin(y * 0.1) + 2 * Math.cos(y * 0.25));

const coral = sdf.noise({ scale: 0.15, amplitude: 3, octaves: 4, seed: 7 });

return vase
  .shell(3)
  .intersect(coral)
  .toShape({ edgeLength: 0.5 })
  .color('#e07856');

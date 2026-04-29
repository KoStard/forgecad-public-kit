// Nested spheres — three concentric shader-previewed SDF shells.

const outer = sdf.sphere(22).shell(2)
  .intersect(sdf.diamond({ cellSize: 8, wallThickness: 1.1 }))
  .color('#8b5cf6');

const middle = sdf.sphere(16).shell(1.5)
  .intersect(sdf.gyroid({ cellSize: 6, wallThickness: 0.9 }))
  .color('#38bdf8')
  .material({ opacity: 0.72 });

const inner = sdf.sphere(9)
  .color('#facc15')
  .material({ emissive: '#facc15', emissiveIntensity: 0.35 });

return {
  outer,
  middle,
  inner,
};

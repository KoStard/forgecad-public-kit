// SDF native preview — raw SDF leaves render directly by raymarching.
//
// Use .toShape() only when you need mesh-backed CAD operations or export.

const smoothBlob = sdf.smoothUnion(
  sdf.sphere(12),
  sdf.box(18, 18, 18),
  { radius: 4 },
)
  .color('#4488cc')
  .material({ roughness: 0.5, clearcoat: 0.35 });

const smoothCarve = sdf.smoothDifference(
  sdf.box(20, 20, 20),
  sdf.sphere(14),
  { radius: 3 },
)
  .translate(40, 0, 0)
  .color('#cc4444');

const morphed = sdf.morph(
  sdf.sphere(12),
  sdf.box(20, 20, 20),
  0.5,
)
  .translate(80, 0, 0)
  .color('#44cc88');

const twisted = sdf.box(10, 30, 10)
  .twist(6)
  .translate(0, 0, 50)
  .color('#cc88ff');

const lattice = sdf.gyroid({ cellSize: 8, wallThickness: 1.2 })
  .intersect(sdf.sphere(20))
  .translate(40, 0, 50)
  .color('#ffaa44')
  .material({ emissive: '#ff7a18', emissiveIntensity: 0.25 });

const hollowSphere = sdf.sphere(15)
  .shell(2)
  .subtract(sdf.box(40, 40, 20).translate(0, 0, -10))
  .translate(80, 0, 50)
  .color('#88ccff')
  .material({ opacity: 0.82, clearcoat: 0.8 });

return {
  smoothBlob,
  smoothCarve,
  morphed,
  twisted,
  lattice,
  hollowSphere,
};

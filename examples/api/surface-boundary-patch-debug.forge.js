setActiveBackend('occt');

const width = param('Width', 64);
const depth = param('Depth', 42);
const crown = param('Crown', 16);
const wall = param('Wall', 1.6);

const x0 = -width * 0.5;
const x1 = width * 0.5;
const y0 = -depth * 0.5;
const y1 = depth * 0.5;

const flatPatch = Surface.Patch({
  bottom: [[x0, y0, 0], [x1, y0, 0]],
  top: [[x0, y1, 0], [x1, y1, 0]],
  left: [[x0, y0, 0], [x0, y1, 0]],
  right: [[x1, y0, 0], [x1, y1, 0]],
}).translate(-width * 0.72, 0, 0).color('#8fc3ff');

const curvedPatch = Surface.Patch({
  bottom: nurbs3d(
    [[x0, y0, 0], [-width * 0.16, y0, crown * 0.28], [width * 0.16, y0, crown * 0.28], [x1, y0, 0]],
    { degree: 3 },
  ),
  top: nurbs3d(
    [[x0, y1, 2], [-width * 0.18, y1, crown * 0.72], [width * 0.18, y1, crown * 0.72], [x1, y1, 2]],
    { degree: 3 },
  ),
  left: nurbs3d(
    [[x0, y0, 0], [x0 - 4, -depth * 0.12, crown * 0.25], [x0 - 2, depth * 0.18, crown * 0.58], [x0, y1, 2]],
    { degree: 3 },
  ),
  right: nurbs3d(
    [[x1, y0, 0], [x1 + 4, -depth * 0.12, crown * 0.25], [x1 + 2, depth * 0.18, crown * 0.58], [x1, y1, 2]],
    { degree: 3 },
  ),
}).translate(width * 0.72, 0, 0).color('#f596b5');

const curvedSolid = curvedPatch.thicken(wall).translate(width * 0.72, 0, -wall * 2.2).color('#ffd0df');

verify.noSelfIntersection('Flat boundary patch is valid', flatPatch);
verify.noSelfIntersection('Curved boundary patch is valid', curvedPatch);
verify.noSelfIntersection('Thickened curved boundary patch is valid', curvedSolid);

scene({
  background: { top: '#edf3fb', bottom: '#ffffff' },
  camera: { position: [0, -180, 92], target: [0, 0, 12], fov: 36 },
  environment: { preset: 'studio', intensity: 0.46 },
  lights: [
    { type: 'ambient', color: '#dbe6f2', intensity: 0.22 },
    { type: 'directional', position: [160, -160, 180], target: [0, 0, 10], color: '#fff1df', intensity: 1.7, castShadow: true },
    { type: 'directional', position: [-130, 80, 130], target: [0, 0, 12], color: '#b7d5ff', intensity: 0.7 },
  ],
  ground: { visible: true, color: '#eef2f6', height: -wall * 2.2, receiveShadow: true },
});

return [
  { name: 'Flat 4-Edge Patch', shape: flatPatch },
  { name: 'Exact Curved 4-Edge Patch', shape: curvedPatch },
  { name: 'Thickened Curved Patch', shape: curvedSolid },
];

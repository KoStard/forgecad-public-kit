setActiveBackend('occt');

const width = param('Width', 112);
const depth = param('Depth', 78);
const height = param('Height', 44);
const wall = param('Wall', 2.4);
const explode = param('Explode', 18);

const x0 = -width * 0.5;
const x1 = width * 0.5;
const y0 = -depth * 0.5;
const y1 = depth * 0.5;
const z0 = 0;
const z1 = height;

function quadPatch(bottom, top, left, right) {
  return Surface.Patch({ bottom, top, left, right });
}

const bottom = quadPatch(
  [[x0, y0, z0], [x1, y0, z0]],
  [[x0, y1, z0], [x1, y1, z0]],
  [[x0, y0, z0], [x0, y1, z0]],
  [[x1, y0, z0], [x1, y1, z0]],
);

const top = quadPatch(
  [[x0, y0, z1], [x1, y0, z1]],
  [[x0, y1, z1], [x1, y1, z1]],
  [[x0, y0, z1], [x0, y1, z1]],
  [[x1, y0, z1], [x1, y1, z1]],
);

const front = quadPatch(
  [[x0, y0, z0], [x1, y0, z0]],
  [[x0, y0, z1], [x1, y0, z1]],
  [[x0, y0, z0], [x0, y0, z1]],
  [[x1, y0, z0], [x1, y0, z1]],
);

const back = quadPatch(
  [[x0, y1, z0], [x1, y1, z0]],
  [[x0, y1, z1], [x1, y1, z1]],
  [[x0, y1, z0], [x0, y1, z1]],
  [[x1, y1, z0], [x1, y1, z1]],
);

const left = quadPatch(
  [[x0, y0, z0], [x0, y1, z0]],
  [[x0, y0, z1], [x0, y1, z1]],
  [[x0, y0, z0], [x0, y0, z1]],
  [[x0, y1, z0], [x0, y1, z1]],
);

const right = quadPatch(
  [[x1, y0, z0], [x1, y1, z0]],
  [[x1, y0, z1], [x1, y1, z1]],
  [[x1, y0, z0], [x1, y0, z1]],
  [[x1, y1, z0], [x1, y1, z1]],
);

const shell = Surface.Sew([bottom, top, front, back, left, right]);
const enclosure = shell.thicken(wall).translate(0, 0, height * 0.22).color('#8fc3ff');

verify.edgeContinuity('Sheet shell stays exact at G0 seams', shell, { continuity: 'G0' });
verify.noTinyEdges('Enclosure has no tiny edges', enclosure, 0.02);
verify.noSelfIntersection('Enclosure topology is valid', enclosure);

scene({
  background: { top: '#edf3fb', bottom: '#ffffff' },
  camera: { position: [210, -260, 180], target: [0, 0, 30], fov: 35 },
  environment: { preset: 'studio', intensity: 0.45 },
  lights: [
    { type: 'ambient', color: '#dbe6f2', intensity: 0.2 },
    { type: 'directional', position: [220, -180, 220], target: [0, 0, 28], color: '#fff1df', intensity: 1.7, castShadow: true },
    { type: 'directional', position: [-150, 100, 140], target: [0, 0, 20], color: '#b7d5ff', intensity: 0.7 },
  ],
  ground: { visible: true, color: '#eef2f6', height: 0, receiveShadow: true },
});

return [
  { name: 'Bottom Sheet', shape: bottom.translate(0, 0, -explode).color('#91b4ff') },
  { name: 'Top Sheet', shape: top.translate(0, 0, explode).color('#91b4ff') },
  { name: 'Front Sheet', shape: front.translate(0, -explode, 0).color('#6fd3cc') },
  { name: 'Back Sheet', shape: back.translate(0, explode, 0).color('#6fd3cc') },
  { name: 'Left Sheet', shape: left.translate(-explode, 0, 0).color('#ffb37a') },
  { name: 'Right Sheet', shape: right.translate(explode, 0, 0).color('#ffb37a') },
  { name: 'Sewn + Thickened Shell', shape: enclosure },
];

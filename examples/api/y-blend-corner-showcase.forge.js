setActiveBackend('occt');

const width = param('Width', 104);
const depth = param('Depth', 76);
const height = param('Height', 42);
const radius = param('Blend Radius', 12);
const offset = width * 0.72;

function speakerBlock() {
  return Rectangle2D.fromDimensions(-width * 0.5, -depth * 0.5, width, depth).extrude(height);
}

const before = speakerBlock().translate(-offset, 0, 0).color('#7b88a7');

const seed = speakerBlock();
const after = Blend.CornerY({
  shape: seed,
  edges: [seed.edge('top-bottom'), seed.edge('top-right'), seed.edge('vert-br')],
  radius,
  continuity: 'G2',
})
  .translate(offset, 0, 0)
  .color('#9ed892');

verify.edgeContinuity('Blended body keeps exact seams at least G0', after, { continuity: 'G0' });
verify.noTinyEdges('Blended body has no tiny edges', after, 0.02);
verify.noSelfIntersection('Blended body is valid', after);

scene({
  background: { top: '#eaf0f7', bottom: '#fcfdff' },
  camera: { position: [0, -260, 145], target: [0, 0, 24], fov: 33 },
  environment: { preset: 'studio', intensity: 0.44 },
  lights: [
    { type: 'ambient', color: '#d6e3ef', intensity: 0.2 },
    { type: 'directional', position: [180, -180, 200], target: [0, 0, 20], color: '#fff0dc', intensity: 1.8, castShadow: true },
    { type: 'directional', position: [-170, 110, 160], target: [0, 0, 18], color: '#b8d4ff', intensity: 0.75 },
  ],
  ground: { visible: true, color: '#eff3f7', height: 0, receiveShadow: true },
});

return [
  { name: 'Sharp Corner Seed', shape: before },
  { name: 'Y-Blend Corner Result', shape: after },
];

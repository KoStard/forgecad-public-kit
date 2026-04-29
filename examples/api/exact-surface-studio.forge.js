setActiveBackend('occt');

const span = param('Span', 128);
const depth = param('Depth', 88);
const crown = param('Crown', 26);
const wall = param('Wall', 2.2);

const halfSpan = span * 0.5;
const halfDepth = depth * 0.5;

const canopySheet = Surface.Nurbs(
  [
    [
      [-halfSpan, -halfDepth, 0],
      [-halfSpan * 0.32, -halfDepth, crown * 0.28],
      [halfSpan * 0.32, -halfDepth, crown * 0.28],
      [halfSpan, -halfDepth, 0],
    ],
    [
      [-halfSpan, -halfDepth * 0.25, crown * 0.15],
      [-halfSpan * 0.25, -halfDepth * 0.15, crown * 0.92],
      [halfSpan * 0.25, -halfDepth * 0.15, crown * 0.92],
      [halfSpan, -halfDepth * 0.25, crown * 0.15],
    ],
    [
      [-halfSpan, halfDepth * 0.25, crown * 0.08],
      [-halfSpan * 0.28, halfDepth * 0.18, crown * 0.78],
      [halfSpan * 0.28, halfDepth * 0.18, crown * 0.78],
      [halfSpan, halfDepth * 0.25, crown * 0.08],
    ],
    [
      [-halfSpan, halfDepth, 0],
      [-halfSpan * 0.35, halfDepth, crown * 0.22],
      [halfSpan * 0.35, halfDepth, crown * 0.22],
      [halfSpan, halfDepth, 0],
    ],
  ],
  { degreeU: 3, degreeV: 3 },
);

const canopySolid = canopySheet.thicken(wall).translate(-span * 0.82, 0, 0).color('#9fd3ff');
const canopyGhost = canopySheet.translate(-span * 0.82, 0, wall * 2.4).color('#d9f0ff');

const archFront = nurbs3d(
  [
    [-halfSpan * 0.55, -halfDepth * 0.58, 2],
    [-halfSpan * 0.18, -halfDepth * 0.58, crown * 0.95],
    [halfSpan * 0.18, -halfDepth * 0.58, crown * 0.95],
    [halfSpan * 0.55, -halfDepth * 0.58, 2],
  ],
  { degree: 3 },
);
const archBack = nurbs3d(
  [
    [-halfSpan * 0.48, halfDepth * 0.52, 0],
    [-halfSpan * 0.14, halfDepth * 0.52, crown * 0.68],
    [halfSpan * 0.14, halfDepth * 0.52, crown * 0.68],
    [halfSpan * 0.48, halfDepth * 0.52, 0],
  ],
  { degree: 3 },
);
const ruledRibbon = Surface.Ruled(archFront, archBack)
  .translate(0, 0, 6)
  .color('#f6c667');

const boundaryPatch = Surface.Patch(
  {
    bottom: nurbs3d(
      [
        [-halfSpan * 0.48, -halfDepth * 0.42, -2],
        [-halfSpan * 0.16, -halfDepth * 0.46, crown * 0.35],
        [halfSpan * 0.16, -halfDepth * 0.46, crown * 0.35],
        [halfSpan * 0.48, -halfDepth * 0.42, -2],
      ],
      { degree: 3 },
    ),
    top: nurbs3d(
      [
        [-halfSpan * 0.48, halfDepth * 0.4, 1],
        [-halfSpan * 0.16, halfDepth * 0.43, crown * 0.62],
        [halfSpan * 0.16, halfDepth * 0.43, crown * 0.62],
        [halfSpan * 0.48, halfDepth * 0.4, 1],
      ],
      { degree: 3 },
    ),
    left: nurbs3d(
      [
        [-halfSpan * 0.48, -halfDepth * 0.42, -2],
        [-halfSpan * 0.58, -halfDepth * 0.12, crown * 0.22],
        [-halfSpan * 0.54, halfDepth * 0.14, crown * 0.52],
        [-halfSpan * 0.48, halfDepth * 0.4, 1],
      ],
      { degree: 3 },
    ),
    right: nurbs3d(
      [
        [halfSpan * 0.48, -halfDepth * 0.42, -2],
        [halfSpan * 0.58, -halfDepth * 0.12, crown * 0.22],
        [halfSpan * 0.54, halfDepth * 0.14, crown * 0.52],
        [halfSpan * 0.48, halfDepth * 0.4, 1],
      ],
      { degree: 3 },
    ),
  },
);

const boundarySolid = boundaryPatch.thicken(wall * 0.75).translate(span * 0.82, 0, 0).color('#f596b5');
const boundaryGhost = boundaryPatch.translate(span * 0.82, 0, wall * 2.2).color('#ffd6e3');

verify.noSelfIntersection('Canopy solid is valid', canopySolid);
verify.noSelfIntersection('Boundary solid is valid', boundarySolid);

scene({
  background: { top: '#e7edf5', bottom: '#fbfdff' },
  camera: { position: [0, -320, 155], target: [0, 0, 32], fov: 34 },
  environment: { preset: 'studio', intensity: 0.48 },
  lights: [
    { type: 'ambient', color: '#d9e6f2', intensity: 0.22 },
    { type: 'directional', position: [180, -220, 240], target: [0, 0, 20], color: '#fff3df', intensity: 1.85, castShadow: true },
    { type: 'directional', position: [-200, 80, 160], target: [0, 0, 30], color: '#b8d4ff', intensity: 0.72 },
  ],
  ground: { visible: true, color: '#eef3f8', height: 0, receiveShadow: true },
});

return [
  { name: 'Thickened NURBS Canopy', shape: canopySolid },
  { name: 'Open NURBS Sheet', shape: canopyGhost },
  { name: 'Ruled Ribbon Sheet', shape: ruledRibbon },
  { name: 'Thickened Boundary Patch', shape: boundarySolid },
  { name: 'Open Boundary Patch', shape: boundaryGhost },
];

// Guard part: mirrored ribs, face-mounted cuts, and repeated wall details in one bracket.

const base = roundedRect(100, 54, 4, true).extrude(10);
const upright = roundedRect(100, 10, 4, true)
  .extrude(56)
  .translate(0, 22, 10);
const rib = box(10, 24, 36, true).translate(36, 10, 28);
const ribs = mirrorCopy(rib, [1, 0, 0]);

const mountHole = lib.fastenerHole({
  size: 'M4',
  fit: 'normal',
  depth: 14,
  counterbore: { depth: 3.5 },
}).translate(28, 0, 5);
const mountHoles = mirrorCopy(mountHole, [1, 0, 0]);

const sensorWindow = roundedRect(36, 16, 3, true)
  .onFace(upright, 'front', { u: 0, v: 6, protrude: 0.25, selfAnchor: 'center' })
  .extrude(12);

const cablePort = roundedRect(18, 8, 2, true)
  .onFace(upright, 'right', { u: 10, v: -8, protrude: 0.25, selfAnchor: 'center' })
  .extrude(12);

const indicatorHole = circle2d(2.5)
  .onFace(upright, 'front', { u: -16, v: -12, protrude: 0.25, selfAnchor: 'center' })
  .extrude(12);
const indicatorArray = linearPattern(indicatorHole, 3, 16, 0);

const bracket = union(base, upright, ribs)
  .subtract(mountHoles)
  .subtract(sensorWindow)
  .subtract(cablePort)
  .subtract(indicatorArray);

return [{ name: 'Sensor Bracket', shape: bracket }];

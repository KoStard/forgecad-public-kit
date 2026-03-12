const shellBase = roundedRect(90, 56, 6, true).extrude(28);
const cup = shellBase.shell(2.5, { openFaces: ['top'] }).color('#6f7b86');
const innerWallPad = roundedRect(16, 9, 1.8, true)
  .onFace(cup, 'inner-side-right', { u: 0, v: -3, protrude: 0.05, selfAnchor: 'center' })
  .extrude(1.4)
  .toShape()
  .color('#f2b16a');

const holeBase = roundedRect(72, 44, 5, true).extrude(20);
const drilled = holeBase.hole('top', { diameter: 8, u: 16, v: -8, depth: 10 }).color('#7a8792');
const floorBoss = circle2d(3)
  .onFace(drilled, 'floor', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(1.2)
  .toShape()
  .color('#d46452');

const cutBase = roundedRect(78, 46, 5, true).extrude(22);
const pocket = roundedRect(20, 12, 2, true)
  .onFace(cutBase, 'front', { u: 0, v: 4, selfAnchor: 'center' });
const cut = cutBase.cutout(pocket, { depth: 8 }).color('#64707d');
const wallTab = rect(5, 4)
  .onFace(cut, 'wall-right', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(1)
  .toShape()
  .color('#5ba6d6');

return [
  { name: 'Shell Inner Wall Pad', shape: union(cup, innerWallPad).translate(-110, 0, 0) },
  { name: 'Blind Hole Floor Boss', shape: union(drilled, floorBoss) },
  { name: 'Cut Wall Tab', shape: union(cut, wallTab).translate(110, 0, 0) },
];

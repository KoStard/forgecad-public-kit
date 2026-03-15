// Shell box side-opening regression.
// Proves that box shells with non-top/bottom face openings lower correctly and that
// compiler-owned inner/outer wall faces remain targetable in downstream operations.

// Part 1: open-front housing — top + front open, boss on inner floor, pad on inner back wall.
const housingBase = box(80, 60, 40);
const housing = housingBase.shell(3, { openFaces: ['top', 'front'] });

const floorBoss = circle2d(6)
  .onFace(housing, 'inner-bottom', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(4)
  .toShape()
  .color('#e8a44a');

const backWallRib = rect(20, 3)
  .onFace(housing, 'inner-side-top', { u: 0, v: 8, protrude: 0.05, selfAnchor: 'center' })
  .extrude(2)
  .toShape()
  .color('#6ab0d8');

// Part 2: left+right open channel — through in X, boss on inner top cap.
const channelBase = box(50, 40, 30, true);
const channel = channelBase.shell(2.5, { openFaces: ['left', 'right'] });

const topCapBoss = circle2d(4)
  .onFace(channel, 'inner-top', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(3)
  .toShape()
  .color('#9ec97a');

// Part 3: front + back open tray — walls on left/right/top/bottom only.
const trayBase = box(70, 50, 20);
const tray = trayBase.shell(2, { openFaces: ['front', 'back'] });

const trayFloorBoss = circle2d(5)
  .onFace(tray, 'inner-bottom', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(3)
  .toShape()
  .color('#c07bc0');

return [
  { name: 'Open-Front Housing', shape: union(housing, floorBoss, backWallRib).translate(-120, 0, 0) },
  { name: 'Through Channel', shape: union(channel, topCapBoss).translate(0, 0, 0) },
  { name: 'Front-Back Open Tray', shape: union(tray, trayFloorBoss).translate(110, 0, 0) },
];

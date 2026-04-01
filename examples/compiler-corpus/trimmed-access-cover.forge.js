// Guard part: trim-created plane cap plus upstream hole/cut rewrites in one ordinary cover workflow.

const base = roundedRect(104, 68, 8, true).extrude(18);

const gusset = roundedRect(20, 8, 2, true)
  .onFace(base, 'front', { u: -22, v: 4, protrude: 0.25, selfAnchor: 'center' })
  .extrude(10);

const merged = union(base, gusset);

const servicePocket = roundedRect(22, 12, 2, true)
  .onFace(base, 'top', { u: 18, v: -10, protrude: 0.25, selfAnchor: 'center' });

const preTrim = merged
  .hole(base.face('top'), { diameter: 6, u: -24, v: 12, depth: 9 })
  .cutout(servicePocket, { depth: 6 });

const trimmed = preTrim.trimByPlane([0, 1, 0], 6);

const latch = roundedRect(16, 10, 2, true)
  .extrude(8, { center: true })
  .translate(0, 28, 8);

const cover = union(trimmed, latch);

return [{ name: 'Trimmed Access Cover', shape: cover }];

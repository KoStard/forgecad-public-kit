// Guard part: shell + face-driven cuts + mirrored feet in one ordinary enclosure workflow.

const base = roundedRect(120, 80, 10, true).extrude(36);
const shell = base.shell(3, { openFaces: ['top'] });

const displayCut = roundedRect(34, 18, 3, true)
  .onFace(base, 'front', { u: 0, v: 8, protrude: 0.25, selfAnchor: 'center' })
  .extrude(10);

const cableCut = circle2d(7)
  .onFace(base, 'right', { u: -12, v: -8, protrude: 0.25, selfAnchor: 'center' })
  .extrude(10);

const foot = roundedRect(18, 18, 4, true)
  .onFace(base, 'bottom', { u: 36, v: 20, protrude: 0, selfAnchor: 'center' })
  .extrude(6);

const feet = mirrorCopy(mirrorCopy(foot, [1, 0, 0]), [0, 1, 0]);

const enclosure = union(shell, feet)
  .subtract(displayCut)
  .subtract(cableCut);

return [{ name: 'Enclosure Shell Cuts', shape: enclosure }];

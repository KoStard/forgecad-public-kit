const plate = roundedRect(96, 56, 6, true).extrude(12);

const bossSeed = roundedRect(18, 12, 2.5, true)
  .onFace(plate, 'top', { u: -28, v: 24, protrude: 0.5, selfAnchor: 'center' })
  .extrude(7);

const bosses = linearPattern(bossSeed, 3, 28, 0, 0);
const cover = union(plate, bosses);

const projected = projectToPlane(cover, { plane: 'XY' });
const lip = projected
  .offset(2)
  .onFace(plate.face('top'), { protrude: 0.5, selfAnchor: 'center' })
  .extrude(1.2);

return [{ name: 'Projection Relay Cover', shape: union(cover, lip) }];

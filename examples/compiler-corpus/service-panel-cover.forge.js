// Guard part: repeated bosses, richer hole variants, projection replay, and a face-driven cut in one service-cover workflow.

const plate = roundedRect(124, 78, 8, true).extrude(12);

const bossSeed = roundedRect(18, 10, 2, true)
  .onFace(plate, 'top', { u: -30, v: 22, protrude: 0.5, selfAnchor: 'center' })
  .extrude(7);
const bosses = linearPattern(bossSeed, 3, 30, 0, 0);

const displayPocket = roundedRect(30, 14, 3, true)
  .onFace(plate, 'top', { u: 0, v: 4, protrude: 0.25, selfAnchor: 'center' });

const topFace = plate.face('top');
const bottomFace = plate.face('bottom');

const cover = union(plate, bosses)
  .hole(topFace, {
    diameter: 5.2,
    u: -46,
    v: -22,
    upToFace: bottomFace,
    countersink: { diameter: 10.5, angleDeg: 90 },
  })
  .hole(topFace, {
    diameter: 5.2,
    u: 46,
    v: -22,
    upToFace: bottomFace,
    countersink: { diameter: 10.5, angleDeg: 90 },
  })
  .hole(topFace, {
    diameter: 4.5,
    u: -30,
    v: 22,
    upToFace: bottomFace,
    counterbore: { diameter: 9, depth: 3 },
  })
  .hole(topFace, {
    diameter: 4.5,
    u: 30,
    v: 22,
    upToFace: bottomFace,
    counterbore: { diameter: 9, depth: 3 },
  })
  .cutout(displayPocket, { depth: 4 });

const projected = projectToPlane(cover, { plane: 'XY' });
const gasket = projected
  .offset(1.8)
  .onFace(topFace, { protrude: 0.5, selfAnchor: 'center' })
  .extrude(1.2);

return [{ name: 'Service Panel Cover', shape: union(cover, gasket) }];

// Guard part: counterbore/countersink hole variants plus an up-to-face service pocket in one ordinary plate workflow.

const plate = roundedRect(118, 76, 8, true).extrude(18);
const exitFace = plate.face('bottom');
const pocketExitFace = plate.toShape().face('side-top');

const servicePocket = roundedRect(34, 18, 4, true)
  .onFace(plate, 'front', { u: 0, v: -2, selfAnchor: 'center' });

const fastenerPlate = plate
  .hole('top', {
    diameter: 6.2,
    u: -34,
    v: 20,
    upToFace: exitFace,
    counterbore: { diameter: 11.5, depth: 4 },
  })
  .hole('top', {
    diameter: 6.2,
    u: 34,
    v: 20,
    upToFace: exitFace,
    counterbore: { diameter: 11.5, depth: 4 },
  })
  .hole('top', {
    diameter: 4.3,
    u: -34,
    v: -20,
    upToFace: exitFace,
    countersink: { diameter: 9, angleDeg: 90 },
  })
  .hole('top', {
    diameter: 4.3,
    u: 34,
    v: -20,
    upToFace: exitFace,
    countersink: { diameter: 9, angleDeg: 90 },
  })
  .cutout(servicePocket, { upToFace: pocketExitFace });

return [{ name: 'Fastener Plate Variants', shape: fastenerPlate }];

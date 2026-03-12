// Guard part: patterned fastener holes, mirrored ears, and deterministic boolean pockets.

const plate = roundedRect(132, 96, 12, true).extrude(10);
const ear = roundedRect(28, 42, 8, true)
  .extrude(10)
  .translate(0, 62, 0);
const body = union(plate, mirrorCopy(ear, [0, 1, 0]));

const centerBore = cylinder(14, 24, undefined, undefined, true);
const bolt = lib.fastenerHole({
  size: 'M4',
  fit: 'normal',
  depth: 14,
  counterbore: { depth: 4 },
}).translate(32, 0, 0);
const boltCircle = circularPattern(bolt, 4);

const earSlot = roundedRect(16, 8, 3, true)
  .extrude(14, { center: true })
  .translate(0, 62, 5);
const earSlots = mirrorCopy(earSlot, [0, 1, 0]);

const lighteningPocket = roundedRect(54, 22, 5, true)
  .extrude(12, { center: true })
  .translate(0, 0, 5);

const motorMount = body
  .subtract(centerBore)
  .subtract(boltCircle)
  .subtract(earSlots)
  .subtract(lighteningPocket);

return [{ name: 'Motor Mount Plate', shape: motorMount }];

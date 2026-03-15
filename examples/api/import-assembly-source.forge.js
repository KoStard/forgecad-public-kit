// Source file for import-assembly demo.
// Returns an Assembly directly (not solved) so the importer controls state.

const linkLen = param("Link Length", 120, { min: 60, max: 200 });

const base = box(60, 60, 16, true).translate(0, 0, 8).color("#6e7b88");
const link = box(linkLen, 20, 20)
  .translate(0, -10, -10)
  .color("#5f87c6");

const mech = assembly("Sub Arm")
  .addPart("Base", base, { metadata: { material: "PETG", qty: 1 } })
  .addPart("Link", link, { metadata: { material: "PETG-CF", qty: 1 } })
  .addRevolute("shoulder", "Base", "Link", {
    axis: [0, 1, 0],
    min: -45,
    max: 120,
    default: 30,
    frame: Transform.identity().translate(0, 0, 16),
  });

return mech.withReferences({
  points: {
    origin: [0, 0, 0],   // centre of the base plate bottom face
    top:    [0, 0, 16],  // top of the base plate (mount surface)
  },
});

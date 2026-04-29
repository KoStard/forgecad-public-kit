// Wood Joinery — dado, rabbet, mortise & tenon
// Demonstrates joint cuts and assembled positioning.

const t = 18; // stock thickness

// ─── BOOKCASE CORNER ───────────────────────────────────────────
// Side panel lies flat: width=250 (X, depth), height=400 (Y, vertical), thickness=18 (Z, face)
let side = Wood.board(250, 400, t, { species: 'birch' });
const shelf = Wood.board(250, 300, t, { species: 'birch' });

// Dado: channel across the face of side for shelf to sit in
side = Wood.dado(side, shelf, { fromBottom: 150 });

// Rabbet: step on the back face for a back panel
side = Wood.rabbet(side, { edge: 'back', width: 6, depth: 9 });

// Assemble the bookcase corner:
// Side panel stands upright — rotate so Y (400mm) becomes vertical (Z)
const sideAssembled = side.shape.rotateX(90).color('#c4956a');

// Shelf sits in the dado channel
// After side.rotateX(90): side is in XZ plane, dado channel is at Z = -200 + 150 + 9 = -41
// Shelf needs its 18mm thickness edge in the dado
const shelfAssembled = shelf.shape
  .rotateX(90)        // stand upright
  .rotateZ(90)        // perpendicular to side
  .translate(0, t, -200 + 150 + t / 2)
  .color('#b8864e');

// ─── TABLE JOINT: MORTISE & TENON ──────────────────────────────
// Leg: width=45 (X), height=400 (Y, vertical), thickness=45 (Z, face for mortise)
// The mortise cuts into Z (45mm face), positioned along Y (400mm height)
let leg = Wood.board(45, 400, 45, { species: 'oak' });
let apron = Wood.board(300, 80, 20, { species: 'oak' });

({ mortiseBoard: leg, tenonBoard: apron } = Wood.mortiseAndTenon(leg, apron, {
  style: 'blind',
  position: { fromTop: 25 },
  cornerRadius: 4,
}));

// Tenon defaults: thickness = 20/3 ≈ 6.7mm, width = min(48, 320) = 48mm, length = 45*2/3 = 30mm

// Assemble: leg stands on its Y-axis (already vertical), apron connects to face
const legAssembled = leg.shape
  .translate(500, 0, 0)
  .color('#a07040');

// Apron: tenon protrudes from +X end. Rotate so it points into the leg's Z-face.
const apronAssembled = apron.shape
  .rotateY(90)                        // tenon now points +Z (into leg face)
  .translate(500, 200 - 25 - 24, 45)  // align with mortise position on leg
  .color('#8b6030');

return [
  { name: 'Side (dado + rabbet)', shape: sideAssembled },
  { name: 'Shelf', shape: shelfAssembled },
  { name: 'Leg (mortise)', shape: legAssembled },
  { name: 'Apron (tenon)', shape: apronAssembled },
];

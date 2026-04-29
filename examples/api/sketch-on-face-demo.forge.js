// Demonstrates .onFace() — placing sketches on planar faces of a 3D body.
//
// The model is a small electronics enclosure with:
//  - a mounting boss on the top face
//  - a ventilation slot cutout on the back face
//  - a badge / label recess on the front face

const W = 80, D = 50, H = 30;

// ── Base enclosure ────────────────────────────────────────────────────────────
const body = roundedRect(W, D, 4)
  .extrude(H)
  .color('#c8cdd6');

// ── Mounting boss on the top face ─────────────────────────────────────────────
// circle2d placed at (u=25, v=15) from the top-face center, protrudes 2 mm
const boss = circle2d(6)
  .subtract(circle2d(2))           // hollow centre for a screw
  .onFace(body, 'top', { u: 25, v: 15, protrude: 0.05 })
  .extrude(4)
  .color('#9aa4b2');

// Symmetric boss on the other side
const boss2 = circle2d(6)
  .subtract(circle2d(2))
  .onFace(body, 'top', { u: -25, v: -15, protrude: 0.05 })
  .extrude(4)
  .color('#9aa4b2');

// ── Raised ribs on the back face ──────────────────────────────────────────────
// Three thin rects stacked vertically in the centre of the back face,
// extruded outward (protrude: 0.05 ensures they sit on the face surface).
const ribSketch = rect(30, 2)
  .translate(0, -6)
  .add(rect(30, 2))
  .add(rect(30, 2).translate(0, 6));

const vents = ribSketch
  .onFace(body, 'back', { protrude: 0.05 })
  .extrude(2)
  .color('#1a1a2e');

// ── Badge recess on the front face ────────────────────────────────────────────
const badge = roundedRect(36, 12, 2)
  .onFace(body, 'front', { v: 4, protrude: 0.05 })
  .extrude(1.5)
  .color('#2563eb');

return [
  { name: 'Body',   shape: body  },
  { name: 'Boss 1', shape: boss  },
  { name: 'Boss 2', shape: boss2 },
  { name: 'Vents',  shape: vents },
  { name: 'Badge',  shape: badge },
];

// center=true vs center=false — the #1 source of positioning confusion.
//
// box(w, d, h)        → corner at origin, extends into +X, +Y, +Z
// box(w, d, h, true)  → centered at origin
//
// Same applies to cylinder(h, r) vs cylinder(h, r, r, undefined, true).

const w = 40, d = 30, h = 20;

// --- Side-by-side comparison ---

// Left: center=false (default). Red sphere marks the origin [0,0,0].
const cornerBox = box(w, d, h).color('#4488cc').translate(-60, 0, 0);
const cornerOrigin = sphere(2).color('#cc0000').translate(-60, 0, 0);

// Right: center=true. Red sphere marks the origin [0,0,0].
const centeredBox = box(w, d, h, true).color('#44cc88').translate(60, 0, 0);
const centeredOrigin = sphere(2).color('#cc0000').translate(60, 0, 0);

// --- Practical impact: placing a cylinder on top of a base ---

// With center=false: cylinder must go to (w/2, d/2, h)
const base1 = box(w, d, h).color('#888888').translate(-60, 60, 0);
const cyl1 = cylinder(15, 6).color('#cc8844').translate(-60 + w/2, 60 + d/2, h);

// With center=true + attachTo: no math needed
const base2 = box(w, d, h, true).color('#888888').translate(60, 60 + d/2, h/2);
const cyl2 = cylinder(15, 6).color('#cc8844')
  .attachTo(base2, 'top', 'bottom');

return [
  { name: "Corner Box (center=false)", shape: cornerBox },
  { name: "Corner Origin ●", shape: cornerOrigin },
  { name: "Centered Box (center=true)", shape: centeredBox },
  { name: "Centered Origin ●", shape: centeredOrigin },
  { name: "Base (corner)", shape: base1 },
  { name: "Cylinder (manual math)", shape: cyl1 },
  { name: "Base (centered)", shape: base2 },
  { name: "Cylinder (attachTo)", shape: cyl2 },
];

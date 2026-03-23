// Fillet on Curved Edges — extruded polygon profiles with smooth rim fillets
// Demonstrates: fillet() on non-straight edges (curved perimeter of extruded profiles)

const filletR = param("Fillet Radius", 2, { min: 0.5, max: 5, unit: "mm" });
const height = param("Height", 25, { min: 10, max: 50, unit: "mm" });

// ── 1. Extruded hexagon with filleted top and bottom rims ───────────────────
const hex = ngon(6, 20).extrude(height);
const hexFilleted = fillet(hex, filletR, { perpendicular: [0, 0, 1] });

// ── 2. Extruded star with filleted top rim ──────────────────────────────────
const starProfile = star(5, 22, 12);
const starBody = starProfile.extrude(height);
const starFilleted = fillet(starBody, filletR, { atZ: height, convex: true });

// ── 3. Cylinder with large top and bottom fillets ───────────────────────────
const cyl = cylinder(height, 18, 18, 64);
const cylFilleted = fillet(cyl, filletR * 1.5, { perpendicular: [0, 0, 1], convex: true });

// ── 4. Pocket with filleted inner vertical edges ────────────────────────────
const block = box(50, 40, height);
const pocket = box(36, 26, height - 5, true)
  .translate(25, 20, height - (height - 5) / 2 + 0.01);
const pocketed = difference(block, pocket);
const pocketFilleted = fillet(pocketed, filletR * 0.8, {
  concave: true,
  parallel: [0, 0, 1],
});

// ── Layout ──────────────────────────────────────────────────────────────────
const sp = 65;
return [
  { name: "Hex Rim", shape: hexFilleted.translate(-sp * 1.5, 0, 0) },
  { name: "Star Top", shape: starFilleted.translate(-sp * 0.5, 0, 0) },
  { name: "Cylinder", shape: cylFilleted.translate(sp * 0.5, 0, 0) },
  { name: "Pocket Blend", shape: pocketFilleted.translate(sp * 1.5, 0, 0) },
];

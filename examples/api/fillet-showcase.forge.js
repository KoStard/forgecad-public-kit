// Fillet Showcase — the new fillet() API
// Demonstrates: fillet(), edge queries, multi-edge, curved edges

const r = Param.number("Fillet Radius", 3, { min: 0.5, max: 8, unit: "mm" });

// ── 1. Basic: fillet all edges of a box ─────────────────────────────────────
const simpleBox = box(30, 20, 15);
const roundedBox = fillet(simpleBox, r);

// ── 2. Selective: fillet only top edges ──────────────────────────────────────
const tallBox = box(25, 25, 30);
const topFilleted = fillet(tallBox, r, { atZ: 30, convex: true });

// ── 3. Selective: fillet only vertical edges ─────────────────────────────────
const vertFilleted = fillet(tallBox, r, { parallel: [0, 0, 1], convex: true });

// ── 4. Boolean result: fillet the sharp edges after a cut ────────────────────
const base = box(40, 30, 20);
const cutter = cylinder(25, 10, 10, 32).translate(20, 15, 10);
const cutPart = difference(base, cutter);
const cutFilleted = fillet(cutPart, 2, { convex: true, minLength: 3 });

// ── 5. Curved edges: fillet the top rim of a hexagon ────────────────────────
const hex = ngon(6, 15).extrude(20);
const hexFilleted = fillet(hex, r, { atZ: 20, convex: true });

// ── 6. Curved edges: fillet the rim of a cylinder ───────────────────────────
const cyl = cylinder(20, 15, 15, 48);
const cylFilleted = fillet(cyl, r, { perpendicular: [0, 0, 1], convex: true });

// ── Layout ──────────────────────────────────────────────────────────────────
const spacing = 55;
return [
  { name: "All Edges", shape: roundedBox.translate(-spacing * 2.5, 0, 0) },
  { name: "Top Only", shape: topFilleted.translate(-spacing * 1.5, 0, 0) },
  { name: "Verticals", shape: vertFilleted.translate(-spacing * 0.5, 0, 0) },
  { name: "Boolean Cut", shape: cutFilleted.translate(spacing * 0.5, 0, 0) },
  { name: "Hex Rim", shape: hexFilleted.translate(spacing * 1.5, 0, 0) },
  { name: "Cylinder Rim", shape: cylFilleted.translate(spacing * 2.5, 0, 0) },
];

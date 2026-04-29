// Filleted Electronics Enclosure — practical engineering part
// Demonstrates: fillet() for professional-looking product design

const width = Param.number("Width", 80, { min: 50, max: 120, unit: "mm" });
const depth = Param.number("Depth", 50, { min: 30, max: 80, unit: "mm" });
const height = Param.number("Height", 25, { min: 15, max: 40, unit: "mm" });
const wall = Param.number("Wall", 2.5, { min: 1.5, max: 4, unit: "mm" });
const outerR = Param.number("Outer Fillet", 4, { min: 1, max: 10, unit: "mm" });

// ── Outer shell with rounded vertical edges ─────────────────────────────────
const outer = box(width, depth, height);
let enclosure = fillet(outer, outerR, { parallel: [0, 0, 1], convex: true });

// ── Hollow interior ─────────────────────────────────────────────────────────
// box() is XY-centered, Z starts at 0 — cavity just needs a Z shift
const cavity = box(width - wall * 2, depth - wall * 2, height - wall)
  .translate(0, 0, wall + 0.01);
enclosure = difference(enclosure, cavity);

// ── Screw bosses ────────────────────────────────────────────────────────────
const bossR = 4;
const bossH = height - wall - 1;
const inset = wall + bossR + 2;

function screwBoss(x, y) {
  const boss = cylinder(bossH, bossR, bossR, 24).translate(x, y, wall);
  const hole = cylinder(bossH + 1, 1.5, 1.5, 16).translate(x, y, wall - 0.5);
  return difference(boss, hole);
}

// Positions relative to centered box: -width/2..+width/2
const hw = width / 2;
const hd = depth / 2;
enclosure = union(
  enclosure,
  screwBoss(-hw + inset, -hd + inset),
  screwBoss( hw - inset, -hd + inset),
  screwBoss(-hw + inset,  hd - inset),
  screwBoss( hw - inset,  hd - inset),
);

return enclosure;

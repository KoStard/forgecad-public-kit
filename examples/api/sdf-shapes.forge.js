// SDF (Signed Distance Field) API — smooth booleans, TPMS lattices, domain warps
//
// SDF shapes live in "SDF space" until .toShape() meshes them into regular
// ForgeCAD shapes. This unlocks operations that are impossible in B-rep:
// smooth blending, lattice infill, twist/bend deformations, and more.

// ── Smooth boolean: sphere + box blended together ───────────────────────────
const smoothBlob = sdf.smoothUnion(
  sdf.sphere(12),
  sdf.box(18, 18, 18),
  { radius: 4 }
).toShape()
  .color('#4488cc');

// ── Smooth difference: carve a sphere smoothly from a box ───────────────────
const smoothCarve = sdf.smoothDifference(
  sdf.box(20, 20, 20),
  sdf.sphere(14),
  { radius: 3 }
).toShape()
  .translate(40, 0, 0)
  .color('#cc4444');

// ── Morph: halfway between a sphere and a box ──────────────────────────────
const morphed = sdf.morph(
  sdf.sphere(12),
  sdf.box(20, 20, 20),
  0.5
).toShape()
  .translate(80, 0, 0)
  .color('#44cc88');

// ── Twist: a twisted box ────────────────────────────────────────────────────
const twisted = sdf.box(10, 30, 10)
  .twist(6)   // 6 degrees per unit along Y
  .toShape()
  .translate(0, 0, 50)
  .color('#cc88ff');

// ── TPMS gyroid lattice bounded by a sphere ─────────────────────────────────
const lattice = sdf.gyroid({ cellSize: 8, thickness: 1.2 })
  .intersect(sdf.sphere(20))
  .toShape()
  .translate(40, 0, 50)
  .color('#ffaa44');

// ── Shell: hollow sphere ────────────────────────────────────────────────────
const hollowSphere = sdf.sphere(15)
  .shell(2)
  .subtract(sdf.box(40, 40, 20).translate(0, 0, -10))  // cut open
  .toShape()
  .translate(80, 0, 50)
  .color('#88ccff');

return [smoothBlob, smoothCarve, morphed, twisted, lattice, hollowSphere];

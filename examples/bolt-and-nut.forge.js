// Bolt and Nut — with thread approximation
// ForgeCAD doesn't have native helix/thread, so we approximate
// using warp() to create helical displacement on the shaft surface.

const boltD = param("Bolt Diameter", 8, { min: 4, max: 20, unit: "mm" });
const boltLen = param("Bolt Length", 30, { min: 10, max: 60, unit: "mm" });
const headH = param("Head Height", 5, { min: 3, max: 12, unit: "mm" });
const headAF = param("Head Across Flats", 13, { min: 7, max: 30, unit: "mm" });
const threadPitch = param("Thread Pitch", 1.25, { min: 0.5, max: 3, step: 0.25, unit: "mm" });
const threadDepth = param("Thread Depth", 0.6, { min: 0.2, max: 1.5, step: 0.1, unit: "mm" });
const nutH = param("Nut Height", 6.5, { min: 3, max: 12, unit: "mm" });
const nutAF = param("Nut Across Flats", 13, { min: 7, max: 30, unit: "mm" });
const showNut = param("Show Nut", 1, { min: 0, max: 1, step: 1 });
const nutGap = param("Nut Gap", 5, { min: 0, max: 20, unit: "mm" });

const boltR = boltD / 2;

// --- Bolt head (hex) ---
const headSlab = box(headAF * 1.2, headAF, headH, true).translate(0, 0, headH / 2);
const hexHead = headSlab
  .intersect(headSlab.rotate(0, 0, 60))
  .intersect(headSlab.rotate(0, 0, 120));

// --- Threaded shaft ---
// High segment count so warp has enough vertices to deform
const shaft = cylinder(boltLen, boltR, undefined, 64, false)
  .translate(0, 0, -boltLen);

// Warp creates helical thread profile by displacing vertices radially
// based on a triangle wave that spirals around the shaft.
// warp() modifies the array in-place — must use v[0], v[1], v[2]
const threaded = shaft.warp((v) => {
  const x = v[0], y = v[1], z = v[2];
  const r = Math.sqrt(x * x + y * y);
  if (r < 0.1) return;
  const angle = Math.atan2(y, x);
  // Helical phase: angle + z-dependent rotation
  const phase = angle + (z / threadPitch) * Math.PI * 2;
  // Triangle wave → thread profile (peak = thread crest, valley = root)
  const t = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const wave = t < Math.PI ? (t / Math.PI) : (2 - t / Math.PI);
  const displacement = (wave - 0.5) * threadDepth;
  const scale = (r + displacement) / r;
  v[0] = x * scale;
  v[1] = y * scale;
});

// Chamfer at bolt tip
const tipChamfer = cylinder(threadDepth * 3, boltR + threadDepth + 0.1, 0, 32)
  .translate(0, 0, -boltLen - 0.01);

// Small fillet under head (transition from head to shaft)
const headFillet = cylinder(1, boltR + 0.5, boltR, 32)
  .translate(0, 0, -1);

const bolt = union(hexHead, threaded, headFillet).subtract(tipChamfer);

// --- Nut ---
const nutParts = [];
if (showNut >= 1) {
  const nutSlab = box(nutAF * 1.2, nutAF, nutH, true);
  let nut = nutSlab
    .intersect(nutSlab.rotate(0, 0, 60))
    .intersect(nutSlab.rotate(0, 0, 120));

  // Bore hole (clearance for bolt)
  const bore = cylinder(nutH + 1, boltR + 0.15, undefined, 48, true);
  nut = nut.subtract(bore);

  // Chamfer top and bottom of nut (beveled edges)
  const chamferH = 1.2;
  const nutOuterR = nutAF / (2 * Math.cos(Math.PI / 6)); // circumradius
  const topChamfer = cylinder(chamferH, nutOuterR + 0.5, nutOuterR - chamferH, 6)
    .translate(0, 0, nutH / 2 - chamferH + 0.01);
  const botChamfer = cylinder(chamferH, nutOuterR - chamferH, nutOuterR + 0.5, 6)
    .translate(0, 0, -nutH / 2 - 0.01);
  nut = nut.subtract(topChamfer).subtract(botChamfer);

  // Position on bolt
  const nutZ = -boltLen + nutGap + nutH / 2;
  nut = nut.translate(0, 0, nutZ);

  nutParts.push({ name: "Nut", shape: nut, color: "#999999" });
}

return [
  { name: "Bolt", shape: bolt, color: "#aaaaaa" },
  ...nutParts,
];

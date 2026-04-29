// Smooth drone arm: flat rectangular mount → organic taper → circular motor mount
// Tests: cross-section morphing, S-curve sweep, shell, G2 transitions

// --- Spine: gentle S-curve from origin to motor mount ---
const armLength = 120;
const spine = spline3d([
  [0, 0, 0],
  [armLength * 0.3, 0, 8],
  [armLength * 0.7, 0, -5],
  [armLength, 0, 3],
], { tension: 0.3 });

// --- Cross-sections ---

// Mount end: flat rectangle with rounded corners
const mountProfile = roundedRect(20, 6, 1.5);

// Mid-section: transitional rounded rectangle
const midProfile = roundedRect(14, 10, 4);

// Motor end: circle
const motorProfile = circle2d(8);

// --- Variable sweep: morph between profiles along spine ---
const solidArm = variableSweep(spine, [
  { t: 0, profile: mountProfile },
  { t: 0.4, profile: midProfile },
  { t: 1, profile: motorProfile },
], { edgeLength: 1.5 });

// --- Hollow it out ---
const arm = solidArm.shell(1.5);

// --- Mounting holes at the flat end ---
const mountHole = cylinder(10, 2).translate(0, 0, -5);
const mountHoles = union(
  mountHole.translate(-6, 0, 0),
  mountHole.translate(6, 0, 0),
);

// --- Motor mount ring at the far end ---
// Place at the end of the spine
const motorRing = difference(
  cylinder(4, 10),
  cylinder(4, 7),
).translate(armLength, 0, 3);

const result = difference(
  union(arm, motorRing),
  mountHoles,
);

return result;

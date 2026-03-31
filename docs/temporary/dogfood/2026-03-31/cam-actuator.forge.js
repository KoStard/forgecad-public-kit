// Cam Actuator — Ported from build123d
// A cam actuator with hub, curved "banana" arm, bolt circle, and central bore.

// ---------------------------------------------------------
// 1. Blueprint Parameterization
// ---------------------------------------------------------
const hubR = param("Hub Radius", 50, { min: 30, max: 80, unit: "mm" });
const gap = param("Gap", 43.4, { min: 20, max: 60, unit: "mm" });
const innerArcR = param("Inner Arc R", 115, { min: 80, max: 150, unit: "mm" });
const armWidth = param("Arm Width", 40, { min: 20, max: 60, unit: "mm" });
const thickness = param("Thickness", 15, { min: 5, max: 30, unit: "mm" });

// Derived: arc center sits so that inner arc tangent is at hub edge + gap
const arcCenterX = (hubR + gap) - innerArcR;
const pitchR = innerArcR + armWidth / 2; // 135 for default values
const sweepHalf = 37; // degrees each side of centerline

// ---------------------------------------------------------
// 2. Build the Positive Profile (no trig!)
// ---------------------------------------------------------

// Hub circle
const hub = circle2d(hubR);

// Connecting arm — left edge at X=0, centered on Y
const arm = rect(100, armWidth, true).translate(50, 0);

// Curved "banana" slot — arc by center + angles, then stroke
const banana = path()
  .arc(arcCenterX, 0, pitchR, -sweepHalf, sweepHalf)
  .stroke(armWidth, 'Round');

// Union the positive shapes
const solidProfile = union2d(hub, arm, banana);

// ---------------------------------------------------------
// 3. Fillet where arm meets hub
// ---------------------------------------------------------
// offset(-r).offset(+r) rounds all convex corners — not selective,
// but acceptable for this part shape.
const filletR = 5;
const roundedProfile = solidProfile.offset(-filletR).offset(filletR);

// ---------------------------------------------------------
// 4. Carve out Negative Spaces
// ---------------------------------------------------------

// Central bore
const bore = circle2d(15);

// Bolt circle — 6x Ø22 holes at R32.5, starting at 90°
const boltHoles = circularLayout(6, 32.5, { startDeg: 90 })
  .map(({ x, y }) => circle2d(11).translate(x, y));

// Inner curved slot cutter (same arc path, width 20)
const innerSlot = path()
  .arc(arcCenterX, 0, pitchR, -sweepHalf, sweepHalf)
  .stroke(20, 'Round');

// Subtract all cutters
const finalProfile = roundedProfile.subtract(bore, ...boltHoles, innerSlot);

// ---------------------------------------------------------
// 5. Extrude to 3D
// ---------------------------------------------------------
return finalProfile.extrude(thickness);

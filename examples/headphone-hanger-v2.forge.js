// Headphone Hanger — under-desk clamp mount
// Clamps to the bottom edge of a desk, hook hangs below.
// Designed for actual 3D printing / building.

const deskThick = param("Desk Thickness", 25, { min: 15, max: 50, unit: "mm" });
const clampDepth = param("Clamp Depth", 40, { min: 25, max: 70, unit: "mm" });
const width = param("Width", 50, { min: 30, max: 80, unit: "mm" });
const thick = param("Material Thick", 5, { min: 3, max: 10, unit: "mm" });
const hookDrop = param("Hook Drop", 60, { min: 30, max: 100, unit: "mm" });
const hookLen = param("Hook Length", 35, { min: 15, max: 60, unit: "mm" });
const hookCurveR = param("Hook Curve R", 15, { min: 5, max: 30, unit: "mm" });
const padThick = param("Pad Thickness", 2, { min: 1, max: 5, unit: "mm" });
const boltHoleD = param("Bolt Hole", 5, { min: 0, max: 8, unit: "mm" });

// The clamp is a C-shape that grips the desk edge.
// Top jaw sits on top of desk, bottom jaw presses from below.
// A vertical arm drops down, then curves into the hook.

// --- Top jaw (sits on desk surface) ---
const topJaw = box(width, clampDepth, thick);

// --- Vertical back (connects top to bottom jaw) ---
const backWall = box(width, thick, deskThick + thick * 2)
  .translate(0, 0, -deskThick - thick);

// --- Bottom jaw (presses up against desk bottom) ---
const bottomJaw = box(width, clampDepth * 0.6, thick)
  .translate(0, 0, -deskThick - thick);

// --- Pad on bottom jaw (rubber contact, slightly inset) ---
const pad = box(width - 10, clampDepth * 0.5, padThick)
  .translate(5, 5, -deskThick);

// --- Vertical arm dropping down from bottom jaw ---
const armTop = -deskThick - thick;
const arm = box(width, thick, hookDrop)
  .translate(0, clampDepth * 0.6 - thick, armTop - hookDrop);

// --- Hook (curved part at bottom) ---
// Use revolve to make a clean quarter-torus for the curve
const hookZ = armTop - hookDrop;
const armY = clampDepth * 0.6 - thick;

// Quarter-torus: revolve a rect(width x thick) around an axis at hookCurveR distance
// The profile sits at X = hookCurveR (distance from revolution axis = Y)
// revolve() goes around Y axis, so profile X = radial, profile Y = height
const curveProfile = rect(thick, width).translate(hookCurveR, 0);
const curvePiece = curveProfile.revolve(90)
  // revolve produces shape around Y axis; rotate to align:
  // we need the arc to go from -Z (down) to +Y (forward)
  .rotate(90, 0, 90)   // align width along X
  .rotate(180, 0, 0)  // flip so arc opens downward-to-forward
  .translate(0, clampDepth * 0.6 + hookCurveR, hookZ);

// Straight hook tip extending forward
const tipY = armY + thick + hookCurveR;
const tipZ = hookZ - hookCurveR - thick;
const hookTip = box(width, hookLen - hookCurveR, thick)
  .translate(0, tipY, tipZ);

// Small upward lip at the end to prevent headphones from sliding off
const lipHeight = 8;
const hookLip = box(width, thick, lipHeight)
  .translate(0, tipY + hookLen - hookCurveR - thick, tipZ + thick);

// --- Bolt holes for tightening clamp (optional) ---
const boltHoles = [];
if (boltHoleD > 0) {
  // Two holes through the top jaw
  const holeSpacing = width * 0.6;
  for (let i = -1; i <= 1; i += 2) {
    boltHoles.push(
      cylinder(thick + 2, boltHoleD / 2)
        .translate(width / 2 + i * holeSpacing / 2, clampDepth * 0.3, -1)
    );
  }
}

// --- Assembly ---
let clamp = union(topJaw, backWall, bottomJaw, arm, curvePiece, hookTip, hookLip);
if (boltHoles.length > 0) {
  clamp = clamp.subtract(union(...boltHoles));
}

return [
  { name: "Clamp + Hook", shape: clamp, color: "#445566" },
  { name: "Desk Pad", shape: pad, color: "#338855" },
];

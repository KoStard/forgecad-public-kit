// Door with hinges — rotate the door by controlling the angle param.
// The door pivots around the hinge pin axis, just like a real door.

const doorW = param("Door Width", 80, { min: 40, max: 120, unit: "mm" });
const doorH = param("Door Height", 200, { min: 100, max: 300, unit: "mm" });
const doorT = param("Door Thickness", 4, { min: 2, max: 10, unit: "mm" });
const angle = param("Open Angle", 45, { min: 0, max: 170, unit: "°" });

const frameW = param("Frame Width", 8, { min: 4, max: 15, unit: "mm" });
const frameD = param("Frame Depth", 6, { min: 3, max: 12, unit: "mm" });

const hingeR = param("Hinge Radius", 3, { min: 1.5, max: 6, unit: "mm" });
const hingeH = param("Hinge Height", 16, { min: 8, max: 30, unit: "mm" });

// ── Door frame (stationary) ──
// U-shaped frame: left, right, top
const frameLeft  = box(frameW, frameD, doorH);
const frameRight = box(frameW, frameD, doorH).translate(doorW + frameW, 0, 0);
const frameTop   = box(doorW + 2 * frameW, frameD, frameW).translate(0, 0, doorH);
const frame = union(frameLeft, frameRight, frameTop).color("#8B7355");

// ── Hinge barrels ──
// Two hinges: one near top, one near bottom
const hingeZ1 = doorH * 0.15;
const hingeZ2 = doorH * 0.85;
// Hinge sits at the door's pivot edge (left side of door = x=frameW)
const hingePivotX = frameW;
const hingePivotY = 0;

function makeHinge(z) {
  // Two barrel halves (frame side + door side) and a pin
  const barrel = cylinder(hingeH, hingeR).translate(hingePivotX, hingePivotY, z - hingeH / 2);
  return barrel;
}

const hinge1 = makeHinge(hingeZ1).color("#888888");
const hinge2 = makeHinge(hingeZ2).color("#888888");

// ── Door panel ──
// Built at origin, then rotated around the hinge axis (Z axis at hinge position)
const doorPanel = box(doorW, doorT, doorH).translate(0, -doorT / 2, 0);

// Rotate around hinge axis: translate pivot to origin, rotate around Z, translate back
const rad = angle * Math.PI / 180;
const cos = Math.cos(rad);
const sin = Math.sin(rad);

// The door's pivot edge is at x=frameW, y=0
// Translate so pivot is at origin, rotate around Z, translate back
const rotatedDoor = doorPanel
  .translate(frameW, 0, 0)           // position door at frame edge
  .translate(-hingePivotX, 0, 0)     // move pivot to origin
  .rotate(0, 0, angle)               // rotate around Z
  .translate(hingePivotX, 0, 0)      // move back
  .color("#C4A46C");

// ── Phase 1 demo: diagonal intersection ──
// Find center of door panel's footprint using diagonal intersection
const doorRect = rectangle(0, 0, doorW, doorH);
const [d1, d2] = doorRect.diagonals();
const doorCenter = d1.intersect(d2);
console.log("Door center (from diagonals):", doorCenter.x.toFixed(1), doorCenter.y.toFixed(1));

// Create a line between the two hinge centers
const hingeLine = line(hingePivotX, hingePivotY, hingePivotX, hingePivotY);
console.log("Hinge axis at x=" + hingePivotX);

return [
  { name: "Frame", shape: frame },
  { name: "Door", shape: rotatedDoor },
  { name: "Hinge Bottom", shape: hinge1 },
  { name: "Hinge Top", shape: hinge2 },
];

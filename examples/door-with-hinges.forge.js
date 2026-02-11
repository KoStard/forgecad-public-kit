// Door with hinges — the door pivots around the hinge axis using joint().
// Drag the "Door Angle" slider to open/close the door.

const doorW = param("Door Width", 80, { min: 40, max: 120, unit: "mm" });
const doorH = param("Door Height", 200, { min: 100, max: 300, unit: "mm" });
const doorT = param("Door Thickness", 4, { min: 2, max: 10, unit: "mm" });

const frameW = param("Frame Width", 8, { min: 4, max: 15, unit: "mm" });
const frameD = param("Frame Depth", 6, { min: 3, max: 12, unit: "mm" });

const hingeR = param("Hinge Radius", 3, { min: 1.5, max: 6, unit: "mm" });
const hingeH = param("Hinge Height", 16, { min: 8, max: 30, unit: "mm" });

// ── Door frame (stationary U-shape) ──
const frame = union(
  box(frameW, frameD, doorH),                                        // left
  box(frameW, frameD, doorH).translate(doorW + frameW, 0, 0),       // right
  box(doorW + 2 * frameW, frameD, frameW).translate(0, 0, doorH),   // top
).color("#8B7355");

// ── Hinge barrels ──
const hingePivot = [frameW, 0, 0];  // pivot axis runs along Z at this XY
const hingeZ1 = doorH * 0.15;
const hingeZ2 = doorH * 0.85;
const hinge1 = cylinder(hingeH, hingeR).translate(frameW, 0, hingeZ1 - hingeH / 2).color("#888888");
const hinge2 = cylinder(hingeH, hingeR).translate(frameW, 0, hingeZ2 - hingeH / 2).color("#888888");

// ── Door panel ──
// Position at frame edge, then use joint() to rotate around hinge axis
const doorPanel = box(doorW, doorT, doorH)
  .translate(frameW, -doorT / 2, 0)
  .color("#C4A46C");

// joint() auto-creates the "Door Angle" slider and rotates around the pivot
const rotatedDoor = joint("Door Angle", doorPanel, [frameW, 0, 0], {
  axis: [0, 0, 1],
  min: -170,
  max: 0,
  default: -45,
  reverse: true
});

// ── Phase 1 demo: diagonal intersection to find door center ──
const doorRect = rectangle(0, 0, doorW, doorH);
const [d1, d2] = doorRect.diagonals();
const doorCenter = d1.intersect(d2);
console.log("Door center (from diagonals):", doorCenter.x.toFixed(1), doorCenter.y.toFixed(1));

return [
  { name: "Frame", shape: frame },
  { name: "Door", shape: rotatedDoor },
  { name: "Hinge Bottom", shape: hinge1 },
  { name: "Hinge Top", shape: hinge2 },
];

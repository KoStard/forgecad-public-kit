const armLength = 100;
const armWidth = 15;
const armThickness = 8;
const jawLength = 30;
const pivotRadius = 6;
const pivotHeight = armThickness + 2;

// Create one arm shape: a long rectangular arm with a jaw at the end
// The arm is along the Y axis, pivot at origin (bottom center of arm)
const armBody = box(armWidth, armLength, armThickness, true)
  .translate(0, armLength / 2, armThickness / 2);

// Jaw is a smaller box protruding sideways (X direction) at the top end of the arm
const jaw = box(armWidth / 2, jawLength, armThickness, true)
  .translate(armWidth / 2 + (armWidth / 4), armLength + jawLength / 2, armThickness / 2);

// Combine arm body and jaw
const armShape = armBody.union(jaw);

// Add a cylindrical pivot boss at the base center of the arm for physical joint
const pivotBoss = cylinder(pivotHeight, pivotRadius, undefined, 32, true)
  .translate(0, 0, pivotHeight / 2);

// Final arm shape with pivot boss
const arm = armShape.union(pivotBoss);

// Create assembly
const asm = assembly("SimpleTongs");

// Add ArmA at origin
asm.addPart("ArmA", arm);

// Add ArmB: same shape, mirrored about YZ plane (X=0), so it faces ArmA
// Positioned so pivot aligns at origin
const armBShape = arm.mirror([1, 0, 0]);
asm.addPart("ArmB", armBShape);

// Add revolute joint "pivot" connecting ArmA (parent) and ArmB (child)
// Joint axis along Z at origin
asm.addRevolute("pivot", "ArmA", "ArmB", {
  axis: [0, 0, 1],
  min: 0,
  max: 30,
  default: 0,
  frame: Transform.identity()
});

// Return the assembly
return asm;
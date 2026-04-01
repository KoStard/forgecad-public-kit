// Assembly + mechanism demo
// Shows Transform composition, assembly joints, BOM metadata, and collision checks.

const baseYaw = param("Base Yaw", 20, { min: -170, max: 170, unit: "°" });
const shoulder = param("Shoulder", 30, { min: -30, max: 110, unit: "°" });
const elbow = param("Elbow", 45, { min: -20, max: 135, unit: "°" });
const open = param("Gripper Open", 28, { min: 0, max: 55, unit: "mm" });

const upperLen = 180;
const foreLen = 160;

const basePlate = box(180, 140, 10, true).translate(0, 0, 5);
const tower = cylinder(20, 36).translate(0, 0, 10);

const m4 = lib.fastenerHole({ size: "M4", fit: "normal", depth: 14, counterbore: { depth: 4 } });
const mountHoles = [
  m4.translate(55, 40, 7),
  m4.translate(-55, 40, 7),
  m4.translate(55, -40, 7),
  m4.translate(-55, -40, 7),
];

const base = difference(union(basePlate, tower), ...mountHoles).color("#6e7b88");

const upperArm = box(upperLen, 28, 28)
  .translate(0, -14, -14)
  .subtract(cylinder(32, 8).pointAlong([0, 1, 0]).translate(0, 0, 0))
  .color("#5f87c6");

const forearm = box(foreLen, 24, 24)
  .translate(0, -12, -12)
  .subtract(cylinder(28, 7).pointAlong([0, 1, 0]).translate(0, 0, 0))
  .color("#6fa2d6");

const wristHub = cylinder(26, 10).pointAlong([1, 0, 0]).translate(0, 0, 0);
const palm = box(34, 44, 16, true).translate(16, 0, 0);
const toolBody = union(wristHub, palm).color("#b8c5d3");

const fingerLen = 50;
const finger = box(fingerLen, 8, 10).translate(8, -4, -5).color("#414952");
const fingerLeft = finger.translate(18, 8 + open * 0.5, 0);
const fingerRight = finger.translate(18, -8 - open * 0.5, 0);
const gripper = group(
  { name: "Tool Body", shape: toolBody },
  { name: "Left Finger", shape: fingerLeft },
  { name: "Right Finger", shape: fingerRight },
);

const mech = assembly("Robot Arm Demo")
  .addPart("Base", base, {
    metadata: { material: "PETG", process: "FDM", tolerance: "+/-0.2mm", qty: 1 },
  })
  .addPart("Upper Arm", upperArm, {
    metadata: { material: "PETG-CF", process: "FDM", qty: 1 },
  })
  .addPart("Forearm", forearm, {
    metadata: { material: "PETG-CF", process: "FDM", qty: 1 },
  })
  .addPart("Gripper", gripper, {
    metadata: { material: "PETG", process: "FDM", notes: "Print fingers in TPU for compliance", qty: 1 },
  })
  .addJoint("baseYaw", "revolute", "Base", "Upper Arm", {
    axis: [0, 0, 1],
    min: -170,
    max: 170,
    frame: Transform.identity().translate(0, 0, 46),
  })
  .addJoint("shoulder", "revolute", "Upper Arm", "Forearm", {
    axis: [0, -1, 0],
    min: -30,
    max: 110,
    frame: Transform.identity().translate(upperLen + 8, 0, 0),
  })
  .addJoint("elbow", "revolute", "Forearm", "Gripper", {
    axis: [0, -1, 0],
    min: -20,
    max: 135,
    frame: Transform.identity().translate(foreLen + 12, 0, 0),
  });

const solved = mech.solve({
  baseYaw,
  shoulder,
  elbow,
});

const collisions = solved.collisionReport({
  minOverlapVolume: 0.5,
  ignorePairs: [
    ["Upper Arm", "Forearm"],
    ["Forearm", "Gripper"],
  ],
});

if (collisions.length > 0) {
  console.warn("Assembly collisions:", collisions);
}

const elbowSweep = mech.sweepJoint("elbow", -20, 135, 16, {
  baseYaw,
  shoulder,
});
const sweptCollisions = elbowSweep.filter(step => step.collisions.length > 0).length;
if (sweptCollisions > 0) {
  console.info(`Elbow sweep has collisions in ${sweptCollisions}/${elbowSweep.length} steps`);
}

console.log("BOM", solved.bom());
console.log("BOM CSV\n" + solved.bomCsv());

return solved;

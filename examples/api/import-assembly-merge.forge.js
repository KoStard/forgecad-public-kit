// importAssembly + mergeInto() demo
// Shows how to compose a parent assembly from imported sub-assemblies,
// preserving full kinematic access across file boundaries.

const leftAngle  = param("Left Shoulder",  45, { min: -45, max: 120, unit: "°" });
const rightAngle = param("Right Shoulder", -20, { min: -45, max: 120, unit: "°" });

const chassis = box(200, 80, 20, true).color("#4a5568");

const robot = assembly("Robot")
  .addPart("Chassis", chassis);

// Merge the left arm — all parts/joints are prefixed "Left Arm."
importAssembly("api/import-assembly-source.forge.js", { "Link Length": 100 })
  .mergeInto(robot, {
    prefix: "Left Arm",
    mountParent: "Chassis",
    mountJoint: "leftMount",
    mountOptions: { frame: Transform.identity().translate(-70, 0, 10) },
  });

// Merge the right arm — same source file, different prefix and position
importAssembly("api/import-assembly-source.forge.js", { "Link Length": 100 })
  .mergeInto(robot, {
    prefix: "Right Arm",
    mountParent: "Chassis",
    mountJoint: "rightMount",
    mountOptions: { frame: Transform.identity().translate(70, 0, 10) },
  });

// Drive sub-assembly joints from the parent using prefixed joint names
const solved = robot.solve({
  "Left Arm.shoulder": leftAngle,
  "Right Arm.shoulder": rightAngle,
});

console.log("BOM:", solved.bom().map(r => r.part));
return solved;

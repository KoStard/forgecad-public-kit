// SDF export demo: four-wheel differential-drive rover with a demo world.
// Run:
//   forgecad export sdf examples/api/sdf-rover-demo.forge.js
//
// Then launch Gazebo against the generated package:
//   export GZ_SIM_RESOURCE_PATH="examples/api/sdf-rover-demo.forge.sdfpkg/models${GZ_SIM_RESOURCE_PATH:+:$GZ_SIM_RESOURCE_PATH}"
//   gz sim -s -r examples/api/sdf-rover-demo.forge.sdfpkg/worlds/forge_scout_trial.sdf
//   gz sim -g examples/api/sdf-rover-demo.forge.sdfpkg/worlds/forge_scout_trial.sdf
//
// Click the 3D view and use W/X/A/D or Q/E/Z/C to drive. S or Space stops the rover.

const chassisLength = 430;
const chassisWidth = 260;
const chassisHeight = 58;
const roofLength = 210;
const roofWidth = 150;
const roofHeight = 46;
const bumperLength = 150;
const bumperWidth = 300;
const bumperDepth = 24;

const wheelRadius = 72;
const wheelWidth = 34;
const wheelTrack = 320;
const wheelbase = 250;
const groundClearance = 26;
const bodyZ = wheelRadius + groundClearance + chassisHeight * 0.5;

const baseDeck = box(chassisLength, chassisWidth, chassisHeight)
  .translate(0, 0, bodyZ);

const roofPod = box(roofLength, roofWidth, roofHeight)
  .translate(20, 0, bodyZ + 40);

const bumper = union(
  box(54, bumperWidth, bumperDepth).translate(chassisLength * 0.5 - 18, 0, wheelRadius + 6),
  box(bumperLength, bumperWidth - 42, bumperDepth * 0.7).translate(chassisLength * 0.5 + 46, 0, wheelRadius - 10),
).color('#c8742b');

const sensorMast = union(
  cylinder(92, 10, undefined, 40).translate(58, 0, bodyZ + 78),
  box(78, 34, 26).translate(88, 0, bodyZ + 126),
).color('#d7dee8');

const chassis = union(baseDeck, roofPod)
  .color('#60707d');

const wheelTire = difference(
  cylinder(wheelWidth, wheelRadius, undefined, 64).pointAlong([0, 1, 0]),
  cylinder(wheelWidth + 2, wheelRadius * 0.56, undefined, 48).pointAlong([0, 1, 0]),
).color('#1d2329');

const wheelRim = union(
  cylinder(wheelWidth * 0.86, wheelRadius * 0.52, undefined, 40).pointAlong([0, 1, 0]),
  cylinder(wheelWidth * 1.02, wheelRadius * 0.16, undefined, 28).pointAlong([0, 1, 0]),
).color('#b8c5d3');

const wheel = group(
  { name: "Tire", shape: wheelTire },
  { name: "Rim", shape: wheelRim }
);

const rover = assembly('Forge Scout Rover')
  .addPart('Chassis', group(
    { name: "Deck", shape: chassis },
    { name: "Bumper", shape: bumper },
    { name: "Sensor Mast", shape: sensorMast }
  ), {
    metadata: {
      material: 'PETG-CF',
      process: 'FDM',
      massKg: 13.5,
      notes: 'Battery bay lives under the roof pod.',
    },
  })
  .addPart('Front Left Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addPart('Front Right Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addPart('Rear Left Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addPart('Rear Right Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addRevolute('frontLeftWheel', 'Chassis', 'Front Left Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(wheelbase * 0.5, wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  })
  .addRevolute('frontRightWheel', 'Chassis', 'Front Right Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(wheelbase * 0.5, -wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  })
  .addRevolute('rearLeftWheel', 'Chassis', 'Rear Left Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(-wheelbase * 0.5, wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  })
  .addRevolute('rearRightWheel', 'Chassis', 'Rear Right Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(-wheelbase * 0.5, -wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  });

robotExport({
  assembly: rover,
  modelName: 'Forge Scout Rover',
  links: {
    Chassis: { massKg: 13.5 },
    'Front Left Wheel': { massKg: 0.95 },
    'Front Right Wheel': { massKg: 0.95 },
    'Rear Left Wheel': { massKg: 0.95 },
    'Rear Right Wheel': { massKg: 0.95 },
  },
  plugins: {
    diffDrive: {
      leftJoints: ['frontLeftWheel', 'rearLeftWheel'],
      rightJoints: ['frontRightWheel', 'rearRightWheel'],
      wheelSeparationMm: wheelTrack,
      wheelRadiusMm: wheelRadius,
      maxLinearVelocity: 1.8,
      maxAngularVelocity: 2.8,
      linearAcceleration: 1.6,
      angularAcceleration: 3.2,
    },
    jointStatePublisher: {
      enabled: true,
      updateRate: 30,
    },
  },
  world: {
    generateDemoWorld: true,
    name: 'Forge Scout Trial',
    spawnPose: [-1800, 0, 120, 0, 0, 0],
    keyboardTeleop: {
      enabled: true,
      linearStep: 0.9,
      angularStep: 1.35,
    },
  },
});

return rover.solve();

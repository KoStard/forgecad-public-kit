// Robot Hand 2
// Goal: printable, robust, budget-friendly (~500-1000 EUR) desktop robot hand + long reach arm.
// Strategy: build small reliable modules, then combine with parametric kinematics.

// ---- 1) Control params (motion + fabrication) ----
const baseYaw = param("Base Yaw", 20, { min: -170, max: 170, unit: "°" });
const shoulderPitch = param("Shoulder Pitch", 35, { min: -25, max: 105, unit: "°" });
const elbowPitch = param("Elbow Pitch", 55, { min: -15, max: 135, unit: "°" });
const wristPitch = param("Wrist Pitch", -20, { min: -100, max: 100, unit: "°" });
const wristRoll = param("Wrist Roll", 10, { min: -180, max: 180, unit: "°" });

const upperLen = param("Upper Arm Len", 210, { min: 140, max: 320, unit: "mm" });
const foreLen = param("Forearm Len", 220, { min: 150, max: 340, unit: "mm" });
const foreExtension = param("Forearm Ext", 70, { min: 0, max: 150, unit: "mm" });

const gripperOpen = param("Gripper Open", 55, { min: 0, max: 90, unit: "mm" });
const fingerCurl = param("Finger Curl", 72, { min: 0, max: 100, unit: "°" });
const payloadType = param("Payload Type", 2, { min: 1, max: 4, integer: true });
const payloadSize = param("Payload Size", 36, { min: 20, max: 65, unit: "mm" });
const carryPayload = param("Carry Payload", 1, { min: 0, max: 1, integer: true });

const exploded = param("Exploded", 0, { min: 0, max: 140, unit: "mm" });
const sectionEnabled = param("Section Enabled", 1, { min: 0, max: 1, integer: true });

// ---- 2) Math + transform helpers ----
function rad(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function rotateXPoint(p, deg) {
  const r = rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

function pitchVector(length, deg) {
  const r = rad(deg);
  return [length * Math.cos(r), 0, length * Math.sin(r)];
}

function yawAll(shape) {
  return shape.rotateAround([0, 0, 1], baseYaw, [0, 0, 0]);
}

function explodeShape(shape, v, stage) {
  const k = exploded * stage;
  return shape.translate(v[0] * k, v[1] * k, v[2] * k);
}

function applySectionCuts(shape, sectionX, sectionZ, bounds) {
  if (sectionEnabled === 0) {
    return shape;
  }
  const xSpan = Math.max(200, bounds.max[0] - bounds.min[0] + 240);
  const ySpan = Math.max(200, bounds.max[1] - bounds.min[1] + 240);
  const zSpan = Math.max(200, bounds.max[2] - bounds.min[2] + 240);
  const yCenter = (bounds.min[1] + bounds.max[1]) * 0.5;
  const zCenter = (bounds.min[2] + bounds.max[2]) * 0.5;
  const xCenter = (bounds.min[0] + bounds.max[0]) * 0.5;

  const cutX = box(xSpan * 2, ySpan, zSpan, true).translate(sectionX + xSpan, yCenter, zCenter);
  const cutZ = box(xSpan, ySpan, zSpan * 2, true).translate(xCenter, yCenter, sectionZ + zSpan);
  return shape.subtract(cutX).subtract(cutZ);
}

function applySectionToItem(item, sectionX, sectionZ, bounds) {
  if (item.shape) {
    return { ...item, shape: applySectionCuts(item.shape, sectionX, sectionZ, bounds) };
  }
  if (item.group) {
    return { ...item, group: item.group.map((entry) => applySectionToItem(entry, sectionX, sectionZ, bounds)) };
  }
  return item;
}

function mergeBounds(a, b) {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

function collectItemBounds(item) {
  if (item.shape) {
    return item.shape.boundingBox();
  }
  if (item.group && item.group.length > 0) {
    let acc = null;
    for (let i = 0; i < item.group.length; i++) {
      const b = collectItemBounds(item.group[i]);
      if (!b) continue;
      acc = acc ? mergeBounds(acc, b) : b;
    }
    return acc;
  }
  return null;
}

function collectSceneBounds(items) {
  let acc = null;
  for (let i = 0; i < items.length; i++) {
    const b = collectItemBounds(items[i]);
    if (!b) continue;
    acc = acc ? mergeBounds(acc, b) : b;
  }
  return acc || { min: [-100, -100, -100], max: [100, 100, 100] };
}

function gearDisc(radius, thickness, teeth) {
  return cylinder(thickness, radius, radius, teeth, true).pointAlong([0, 1, 0]);
}

function axle(radius, length) {
  return cylinder(length, radius).pointAlong([0, 1, 0]);
}

function makeHollowBeam(length, width, height, wall, ribs) {
  const safeWall = clamp(wall, 2, Math.min(width, height) * 0.35);
  const innerLen = Math.max(8, length - 2 * safeWall);
  const innerW = Math.max(6, width - 2 * safeWall);
  const innerH = Math.max(6, height - 2 * safeWall);

  const outer = box(length, width, height).translate(0, -width / 2, -height / 2);
  const inner = box(innerLen, innerW, innerH).translate(safeWall, -innerW / 2, -innerH / 2);

  let beam = outer.subtract(inner);

  const ribList = [];
  for (let i = 1; i <= ribs; i++) {
    const x = (i * length) / (ribs + 1) - safeWall * 0.5;
    ribList.push(box(safeWall, innerW, innerH).translate(x, -innerW / 2, -innerH / 2));
  }
  if (ribList.length > 0) {
    beam = union(beam, ...ribList);
  }

  const endBossR = Math.min(width, height) * 0.22;
  const bossA = axle(endBossR, width + 6).translate(0, 0, 0);
  const bossB = axle(endBossR, width + 6).translate(length, 0, 0);

  const windowCuts = [];
  const windowCount = 4;
  for (let i = 0; i < windowCount; i++) {
    const x = length * 0.15 + (i * length * 0.68) / (windowCount - 1);
    windowCuts.push(cylinder(width + 8, Math.max(3, height * 0.12)).pointAlong([0, 1, 0]).translate(x, 0, 0));
  }

  return difference(union(beam, bossA, bossB), ...windowCuts);
}

function makeServoLocal(bodyL, bodyW, bodyH, hornR) {
  const shell = box(bodyL, bodyW, bodyH).translate(-bodyL * 0.62, -bodyW / 2, -bodyH / 2);
  const mountingEar = box(bodyL * 0.28, bodyW + 8, 3).translate(-bodyL * 0.62, -(bodyW + 8) / 2, -bodyH / 2 - 3);
  const horn = gearDisc(hornR, 4, 20);
  const shaft = axle(2.6, bodyW + 10);
  return union(shell, mountingEar, horn, shaft);
}

function makeFingerLocal(jointAngles, segLens, fingerW, fingerH) {
  let x = 0;
  let z = 0;
  let angle = 0;

  const segs = [];
  const pins = [];

  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    const core = box(len, fingerW, fingerH).translate(0, -fingerW / 2, -fingerH / 2);
    const cutW = Math.max(3, fingerW - 3.2);
    const cutH = Math.max(3, fingerH - 3.2);
    const pocket = box(len * 0.56, cutW, cutH).translate(len * 0.24, -cutW / 2, -cutH / 2);

    const seg = core.subtract(pocket)
      .rotateAround([0, -1, 0], angle, [0, 0, 0])
      .translate(x, 0, z);
    segs.push(seg);

    const pin = axle(1.9, fingerW + 2).translate(x, 0, z);
    pins.push(pin);

    x += len * Math.cos(rad(angle));
    z += len * Math.sin(rad(angle));
    angle += jointAngles[i];
  }

  const tipPos = [x, 0, z - fingerH * 0.15];
  const tipPad = sphere(fingerH * 0.65).scale([1.35, 0.9, 0.65]).translate(tipPos[0], tipPos[1], tipPos[2]);
  const tendonTunnel = cylinder(segLens.reduce((a, b) => a + b, 0) + 10, 1.2)
    .pointAlong([1, 0, 0])
    .translate(-4, 0, 0);

  return {
    shell: union(...segs).subtract(tendonTunnel),
    pins: union(...pins),
    tip: tipPad,
    tipPos,
  };
}

function makePayloadLocal(kind, size) {
  if (kind === 1) {
    return sphere(size * 0.5);
  }
  if (kind === 2) {
    return box(size, size * 0.78, size * 0.58, true);
  }
  if (kind === 3) {
    return cylinder(size * 0.9, size * 0.32, undefined, undefined, true);
  }

  const lobeA = sphere(size * 0.35).translate(-size * 0.2, 0, 0);
  const lobeB = sphere(size * 0.28).translate(size * 0.2, size * 0.1, size * 0.05);
  const bridge = box(size * 0.48, size * 0.22, size * 0.28, true);
  return union(lobeA, lobeB, bridge);
}

// ---- 3) Base + mount (manufacturable fixed module) ----
const mountW = 180;
const mountD = 140;
const mountT = 8;

let mountPlate = box(mountW, mountD, mountT, true).translate(0, 0, mountT * 0.5);
const mountHoles = [];
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    mountHoles.push(
      cylinder(mountT + 2, 4.2).translate(sx * (mountW * 0.34), sy * (mountD * 0.34), -1)
    );
  }
}
mountPlate = difference(mountPlate, ...mountHoles);

const clampGap = 38;
const clampNeck = box(44, 28, clampGap + mountT)
  .translate(-22, -mountD / 2 - 14, -clampGap + mountT * 0.5);
const clampJaw = box(130, 28, 10, true)
  .translate(0, -mountD / 2 - 14, -clampGap - 5);
const clampScrew = cylinder(clampGap + 7, 4.8)
  .translate(0, -mountD / 2 - 14, -clampGap - 1);
const clampKnob = cylinder(8, 14, 14, 18, true)
  .translate(0, -mountD / 2 - 14, -clampGap - 11);

const statorH = 44;
const statorR = 56;
let baseStator = cylinder(statorH, statorR).translate(0, 0, mountT);
baseStator = baseStator.subtract(cylinder(statorH + 2, statorR - 10).translate(0, 0, mountT + 4));

const rotorH = 20;
let baseRotor = cylinder(rotorH, 46).translate(0, 0, mountT + statorH - 4);
baseRotor = baseRotor.subtract(cylinder(rotorH + 2, 30).translate(0, 0, mountT + statorH - 3));

const towerH = 40;
const shoulderTower = box(42, 58, towerH, true)
  .translate(0, 0, mountT + statorH + rotorH + towerH * 0.5 - 4);

const yawServoLocal = makeServoLocal(44, 21, 39, 11)
  .translate(-34, 0, mountT + statorH + 8);

// ---- 4) Arm kinematics (iterative chain solve) ----
const shoulderPivot = [0, 0, mountT + statorH + rotorH + towerH * 0.62 - 4];
const forearmAngle = shoulderPitch + elbowPitch;
const handAngle = forearmAngle + wristPitch;

const elbowPivot = add3(shoulderPivot, pitchVector(upperLen, shoulderPitch));
const wristPivot = add3(elbowPivot, pitchVector(foreLen + foreExtension, forearmAngle));

function placeAtShoulder(shape) {
  return yawAll(shape.rotateAround([0, -1, 0], shoulderPitch, [0, 0, 0]).translate(shoulderPivot[0], 0, shoulderPivot[2]));
}

function placeAtElbow(shape) {
  return yawAll(shape.rotateAround([0, -1, 0], forearmAngle, [0, 0, 0]).translate(elbowPivot[0], 0, elbowPivot[2]));
}

function placeInHandFrame(shape) {
  return yawAll(
    shape
      .rotateAround([1, 0, 0], wristRoll, [0, 0, 0])
      .rotateAround([0, -1, 0], handAngle, [0, 0, 0])
      .translate(wristPivot[0], 0, wristPivot[2])
  );
}

// ---- 5) Arm mechanics modules ----
const upperBeam = makeHollowBeam(upperLen, 44, 36, 3.4, 5);
const shoulderHub = gearDisc(16, 14, 28);
const shoulderDrivenGear = gearDisc(26, 8, 42);
const shoulderServo = makeServoLocal(40, 20, 38, 10).translate(-22, 18, -8);
const shoulderAxle = axle(3.6, 70);

const foreOuter = makeHollowBeam(foreLen, 40, 32, 3.2, 5);
const sliderLen = 120 + foreExtension;
const sliderInsert = 70;
let foreSlider = makeHollowBeam(sliderLen, 28, 24, 2.8, 3).translate(foreLen - sliderInsert, 0, 0);

const lockCuts = [];
for (let i = 0; i < 5; i++) {
  const x = foreLen - sliderInsert + 18 + i * 24;
  lockCuts.push(axle(2.2, 36).translate(x, 0, 0));
}
foreSlider = difference(foreSlider, ...lockCuts);

const leadScrew = cylinder(sliderLen + 8, 2.4)
  .pointAlong([1, 0, 0])
  .translate(foreLen - sliderInsert - 4, 0, 0);

const elbowHub = gearDisc(15, 12, 24);
const elbowGear = gearDisc(24, 8, 36);
const elbowServo = makeServoLocal(40, 20, 38, 9).translate(-20, -20, 6);
const elbowAxle = axle(3.4, 62);

const wristCarrierLocal = box(54, 28, 24).translate(-8, -14, -12);
const wristPitchGear = gearDisc(14, 10, 22);
const wristPitchServo = makeServoLocal(34, 18, 32, 8).translate(-18, 15, 0);
const rollTubeLen = 86;
const rollTube = cylinder(rollTubeLen, 11).pointAlong([1, 0, 0]).translate(12, 0, 0);
const rollShaft = cylinder(rollTubeLen + 8, 3).pointAlong([1, 0, 0]).translate(10, 0, 0);

// ---- 6) Hand mechanics (iterative finger generation) ----
const palmLen = 76;
const palmW = 56;
const palmH = 40;
const palmWall = 3;

let palmOuter = box(palmLen, palmW, palmH).translate(0, -palmW / 2, -palmH / 2);
const palmInner = box(palmLen - 2 * palmWall, palmW - 2 * palmWall, palmH - 2 * palmWall)
  .translate(palmWall, -(palmW - 2 * palmWall) / 2, -(palmH - 2 * palmWall) / 2);

const palmAccess = box(palmLen * 0.58, palmW * 0.35, palmH * 0.65)
  .translate(palmLen * 0.18, -palmW * 0.17, -palmH * 0.32);

const knuckleRing = gearDisc(12, 12, 22).translate(palmLen - 8, 0, 0);
const wristRollGear = gearDisc(18, 8, 30).translate(6, 0, 0);
const handServoCore = makeServoLocal(32, 17, 29, 7).translate(16, 0, -2);

let palmShell = difference(palmOuter, palmInner, palmAccess);

const closeRatio = clamp(1 - gripperOpen / 90, 0, 1);
const bend = fingerCurl * closeRatio;
const fingerJointAngles = [bend * 0.5, bend * 0.32, bend * 0.18];
const fingerSegs = [38, 28, 22];
const fingerW = 11;
const fingerH = 9;
const fingerBaseRadius = 12 + gripperOpen * 0.24;
const fingerSpreadAngles = [-110, 10, 130];

const fingerShells = [];
const fingerPins = [];
const fingerTips = [];
const knuckleGears = [];
const fingerTipPoints = [];

for (let i = 0; i < fingerSpreadAngles.length; i++) {
  const phi = fingerSpreadAngles[i];
  const finger = makeFingerLocal(fingerJointAngles, fingerSegs, fingerW, fingerH);

  const rootX = palmLen - 8;
  const shellPlaced = finger.shell
    .translate(rootX, 0, fingerBaseRadius)
    .rotateAround([1, 0, 0], phi, [0, 0, 0]);

  const pinsPlaced = finger.pins
    .translate(rootX, 0, fingerBaseRadius)
    .rotateAround([1, 0, 0], phi, [0, 0, 0]);

  const tipPlaced = finger.tip
    .translate(rootX, 0, fingerBaseRadius)
    .rotateAround([1, 0, 0], phi, [0, 0, 0]);
  const tipPoint = rotateXPoint(
    [finger.tipPos[0] + rootX, finger.tipPos[1], finger.tipPos[2] + fingerBaseRadius],
    phi
  );

  const knuckle = gearDisc(7.5, 6, 16)
    .translate(rootX - 2, 0, fingerBaseRadius)
    .rotateAround([1, 0, 0], phi, [0, 0, 0]);

  fingerShells.push(shellPlaced);
  fingerPins.push(pinsPlaced);
  fingerTips.push(tipPlaced);
  fingerTipPoints.push(tipPoint);
  knuckleGears.push(knuckle);
}

let tipSum = [0, 0, 0];
for (let i = 0; i < fingerTipPoints.length; i++) {
  tipSum = add3(tipSum, fingerTipPoints[i]);
}
const gripCenter = [
  tipSum[0] / fingerTipPoints.length - payloadSize * 0.07,
  tipSum[1] / fingerTipPoints.length,
  tipSum[2] / fingerTipPoints.length,
];

// ---- 7) Payload in hand frame (shows arbitrary-object handling + object rotation) ----
const payloadLocal = makePayloadLocal(payloadType, payloadSize)
  .translate(gripCenter[0], gripCenter[1], gripCenter[2]);

// ---- 8) Transform modules to world ----
const mountGroup = [
  { name: "Mount Plate", shape: explodeShape(mountPlate.color("#7e8a96"), [0, 0, 0], 0.2) },
  { name: "Clamp Neck", shape: explodeShape(clampNeck.color("#5c6770"), [0, -0.12, -1], 1.0) },
  { name: "Clamp Jaw", shape: explodeShape(clampJaw.color("#3e454b"), [0, -0.2, -1], 1.3) },
  { name: "Clamp Screw", shape: explodeShape(clampScrew.color("#c6ccd2"), [0, -0.45, -1], 1.5) },
  { name: "Clamp Knob", shape: explodeShape(clampKnob.color("#2f3439"), [0, -0.7, -1], 1.8) },
];

const yawGroup = [
  { name: "Yaw Stator", shape: explodeShape(baseStator.color("#4a5259"), [0, 0, 0.1], 0.4) },
  { name: "Yaw Rotor", shape: explodeShape(yawAll(baseRotor).color("#768391"), [0, 0, 1], 0.9) },
  { name: "Shoulder Tower", shape: explodeShape(yawAll(shoulderTower).color("#8e9bab"), [0, 0.15, 1], 1.2) },
  { name: "Yaw Servo", shape: explodeShape(yawAll(yawServoLocal).color("#23272b"), [-0.6, 0.6, 0.5], 1.4) },
];

const armGroup = [
  {
    name: "Upper Arm Beam",
    shape: explodeShape(placeAtShoulder(upperBeam).color("#5f87c6"), [0.9, 0, 0.22], 1.0),
  },
  {
    name: "Shoulder Hub",
    shape: explodeShape(placeAtShoulder(shoulderHub).color("#d7dde4"), [0.5, 0.5, 0.2], 1.4),
  },
  {
    name: "Shoulder Gear",
    shape: explodeShape(placeAtShoulder(shoulderDrivenGear).color("#b8c5d3"), [0.5, -0.5, 0.2], 1.5),
  },
  {
    name: "Shoulder Servo",
    shape: explodeShape(placeAtShoulder(shoulderServo).color("#2b3137"), [0.3, 0.9, 0.2], 1.8),
  },
  {
    name: "Shoulder Axle",
    shape: explodeShape(placeAtShoulder(shoulderAxle).color("#d8dde3"), [0.2, -0.9, 0.1], 1.6),
  },
  {
    name: "Forearm Beam",
    shape: explodeShape(placeAtElbow(foreOuter).color("#66a2d8"), [1.2, 0, 0.3], 1.2),
  },
  {
    name: "Forearm Slider",
    shape: explodeShape(placeAtElbow(foreSlider).color("#7fb3e0"), [1.2, 0, 0.9], 1.5),
  },
  {
    name: "Lead Screw",
    shape: explodeShape(placeAtElbow(leadScrew).color("#d8dde3"), [1.2, -0.4, 0.6], 1.8),
  },
  {
    name: "Elbow Hub",
    shape: explodeShape(placeAtElbow(elbowHub).color("#d7dde4"), [0.8, 0.7, 0.3], 1.8),
  },
  {
    name: "Elbow Gear",
    shape: explodeShape(placeAtElbow(elbowGear).color("#b8c5d3"), [0.8, -0.7, 0.3], 1.9),
  },
  {
    name: "Elbow Servo",
    shape: explodeShape(placeAtElbow(elbowServo).color("#2b3137"), [0.8, 1, 0.2], 2.0),
  },
  {
    name: "Elbow Axle",
    shape: explodeShape(placeAtElbow(elbowAxle).color("#d8dde3"), [0.8, -1, 0.2], 1.9),
  },
  {
    name: "Wrist Carrier",
    shape: explodeShape(placeAtElbow(wristCarrierLocal.translate(foreLen + foreExtension, 0, 0)).color("#6fb3b3"), [1.5, 0, 0.3], 1.6),
  },
  {
    name: "Wrist Pitch Gear",
    shape: explodeShape(placeAtElbow(wristPitchGear.translate(foreLen + foreExtension, 0, 0)).color("#c7d0d8"), [1.5, 0.75, 0.4], 1.9),
  },
  {
    name: "Wrist Pitch Servo",
    shape: explodeShape(placeAtElbow(wristPitchServo.translate(foreLen + foreExtension, 0, 0)).color("#2b3137"), [1.5, -0.75, 0.4], 1.9),
  },
  {
    name: "Roll Tube",
    shape: explodeShape(placeAtElbow(rollTube.translate(foreLen + foreExtension, 0, 0)).color("#87bfc2"), [1.8, 0, 0.6], 2.0),
  },
];

const handRootX = rollTubeLen + 12;
function placeHandLocal(shape) {
  return placeInHandFrame(shape.translate(handRootX, 0, 0));
}

const rotatingRollShaftLocal = rollShaft;
const wristCouplerLocal = union(
  cylinder(20, 8.5).pointAlong([1, 0, 0]).translate(handRootX - 20, 0, 0),
  box(14, 6, 18, true).translate(handRootX - 8, 0, 9)
);

const handGroup = [
  {
    name: "Rotating Wrist Shaft",
    shape: explodeShape(placeInHandFrame(rotatingRollShaftLocal).color("#d8dde3"), [1.95, 0.3, 0.72], 2.2),
  },
  {
    name: "Wrist Coupler",
    shape: explodeShape(placeInHandFrame(wristCouplerLocal).color("#9fb3c6"), [2.05, -0.35, 0.76], 2.25),
  },
  {
    name: "Palm Shell",
    shape: explodeShape(placeHandLocal(palmShell).color("#c9a35f"), [2.1, 0, 0.4], 1.6),
  },
  {
    name: "Knuckle Ring",
    shape: explodeShape(placeHandLocal(knuckleRing).color("#d3b67d"), [2.2, 0.7, 0.45], 1.9),
  },
  {
    name: "Wrist Roll Gear",
    shape: explodeShape(placeHandLocal(wristRollGear).color("#c7d0d8"), [2.2, -0.7, 0.45], 1.9),
  },
  {
    name: "Palm Servo",
    shape: explodeShape(placeHandLocal(handServoCore).color("#2b3137"), [2.1, 0.95, 0.4], 2.0),
  },
];

for (let i = 0; i < knuckleGears.length; i++) {
  const dirY = i === 0 ? -1 : i === 1 ? 0.1 : 1;
  handGroup.push({
    name: `Knuckle Gear ${i + 1}`,
    shape: explodeShape(placeHandLocal(knuckleGears[i]).color("#d8dde3"), [2.5, dirY, 0.55], 2.1),
  });
}

for (let i = 0; i < fingerShells.length; i++) {
  const dirY = i === 0 ? -1 : i === 1 ? 0 : 1;
  handGroup.push({
    name: `Finger Shell ${i + 1}`,
    shape: explodeShape(placeHandLocal(fingerShells[i]).color("#c6c2bc"), [2.7, dirY, 0.65], 2.2),
  });
  handGroup.push({
    name: `Finger Pins ${i + 1}`,
    shape: explodeShape(placeHandLocal(fingerPins[i]).color("#d8dde3"), [2.8, dirY * 1.1, 0.8], 2.35),
  });
  handGroup.push({
    name: `Grip Pad ${i + 1}`,
    shape: explodeShape(placeHandLocal(fingerTips[i]).color("#40464d"), [2.95, dirY * 1.15, 0.95], 2.5),
  });
}

const wristPivotMarker = sphere(4).translate(wristPivot[0], 0, wristPivot[2]).color("#e34f4f");
const elbowPivotMarker = sphere(4).translate(elbowPivot[0], 0, elbowPivot[2]).color("#e3944f");
const shoulderPivotMarker = sphere(4).translate(shoulderPivot[0], 0, shoulderPivot[2]).color("#f0d04f");

const kinematicsMarkers = [
  { name: "Shoulder Pivot", shape: yawAll(shoulderPivotMarker) },
  { name: "Elbow Pivot", shape: yawAll(elbowPivotMarker) },
  { name: "Wrist Pivot", shape: yawAll(wristPivotMarker) },
];

const payloadShape = placeInHandFrame(payloadLocal.translate(rollTubeLen + 12, 0, 0)).color("#d98bc7");

const scene = [
  { name: "Mount System", group: mountGroup },
  { name: "Yaw Base", group: yawGroup },
  { name: "Arm Mechanics", group: armGroup },
  { name: "Hand Mechanics", group: handGroup },
  { name: "Kinematic Pivots", group: kinematicsMarkers },
];

if (carryPayload === 1) {
  scene.push({ name: "Payload (Rotates With Hand)", shape: explodeShape(payloadShape, [3.2, 0, 1.05], 2.6) });
}

const sceneBounds = collectSceneBounds(scene);
const sectionMarginX = Math.max(30, (sceneBounds.max[0] - sceneBounds.min[0]) * 0.25);
const sectionMarginZ = Math.max(30, (sceneBounds.max[2] - sceneBounds.min[2]) * 0.25);
const sectionDefaultX = (sceneBounds.min[0] + sceneBounds.max[0]) * 0.5;
const sectionDefaultZ = (sceneBounds.min[2] + sceneBounds.max[2]) * 0.5;

const sectionX = param("Section X", sectionDefaultX, {
  min: sceneBounds.min[0] - sectionMarginX,
  max: sceneBounds.max[0] + sectionMarginX,
  unit: "mm",
});
const sectionZ = param("Section Z", sectionDefaultZ, {
  min: sceneBounds.min[2] - sectionMarginZ,
  max: sceneBounds.max[2] + sectionMarginZ,
  unit: "mm",
});

// UI section toggles (visual clip planes)
cutPlane("Internal X", [1, 0, 0], sectionX);
cutPlane("Internal Z", [0, 0, 1], sectionZ);

const cutScene = scene.map((item) => applySectionToItem(item, sectionX, sectionZ, sceneBounds));
return cutScene;

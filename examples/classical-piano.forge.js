/*
  Classical Grand Piano — detailed example assembly.

  Major parts:
  - Curved grand body with hollow rim
  - Soundboard
  - Opening lid
  - Keybed with white + black keys
  - Music stand
  - Three legs with casters
  - Pedal rail and pedals
  - Bench
*/

const bodyWidth = param("Body Width", 180, { min: 140, max: 240, unit: "mm" });
const bodyLength = param("Body Length", 280, { min: 220, max: 360, unit: "mm" });
const rimHeight = param("Rim Height", 28, { min: 20, max: 40, unit: "mm" });
const lidThickness = param("Lid Thickness", 6, { min: 4, max: 10, unit: "mm" });
const lidOpen = param("Lid Angle", 25, { min: 0, max: 50, unit: "°" });
const legHeight = param("Leg Height", 60, { min: 45, max: 90, unit: "mm" });
const legRadius = param("Leg Radius", 8, { min: 5, max: 12, unit: "mm" });
const keyboardDepth = param("Keyboard Depth", 60, { min: 45, max: 80, unit: "mm" });
const keyHeight = param("Key Height", 5, { min: 3, max: 8, unit: "mm" });

const rimThickness = Math.min(12, bodyWidth * 0.07);
const keyboardWidth = bodyWidth * 0.9;
const keybedHeight = 8;

const whiteKeyCount = 52;
const whiteKeyWidth = keyboardWidth / whiteKeyCount;
const whiteKeyDepth = keyboardDepth * 0.9;

const blackKeyWidth = whiteKeyWidth * 0.6;
const blackKeyDepth = whiteKeyDepth * 0.6;
const blackKeyHeight = keyHeight * 1.4;

// --- Body outline (grand-style curve) ---
const rectW = bodyWidth * 0.72;
const rectL = bodyLength;
const rectX = -bodyWidth / 2 + rectW / 2;

const mainRect = rect(rectW, rectL, true).translate(rectX, 0);
const tailRadius = bodyWidth * 0.42;
const frontRadius = bodyWidth * 0.28;

const tailCircle = circle2d(tailRadius).translate(bodyWidth * 0.15, bodyLength * 0.2);
const frontCircle = circle2d(frontRadius).translate(bodyWidth * 0.18, -bodyLength * 0.35);

const outerSketch = union2d(mainRect, tailCircle, frontCircle);
const innerSketch = outerSketch.offset(-rimThickness);

// --- Rim body (hollowed) ---
const rimOuter = outerSketch.extrude(rimHeight);
const rimInner = innerSketch.extrude(rimHeight - 4).translate(0, 0, 2);

const body = rimOuter
  .subtract(rimInner)
  .translate(0, 0, legHeight)
  .color('#111111');

const bodyBB = body.boundingBox();
const [leftX, frontY] = bodyBB.min;
const [rightX, backY, topZ] = bodyBB.max;
const bodyWidthActual = rightX - leftX;
const bodyLengthActual = backY - frontY;

// --- Soundboard ---
const soundboard = innerSketch
  .extrude(2)
  .attachTo(body, 'top', 'top', [0, 0, -2])
  .color('#c8a96a');

// --- Lid ---
const lidSketch = outerSketch.offset(-rimThickness * 0.2);
const lidRaw = lidSketch.extrude(lidThickness);

const lid = lidRaw
  .attachTo(body, 'top-left', 'bottom-left')
  .translate(-leftX, 0, -topZ)
  .rotate(0, -lidOpen, 0)
  .translate(leftX, 0, topZ)
  .color('#111111');

// --- Keybed ---
const keybed = box(keyboardWidth, keyboardDepth, keybedHeight, true)
  .attachTo(body, 'top-front', 'top-front', [0, 0, -2])
  .color('#222222');

// --- White keys ---
const whiteKey = box(whiteKeyWidth * 0.98, whiteKeyDepth, keyHeight, true).color('#f5f5f5');
const keyboardLeft = -keyboardWidth / 2 + whiteKeyWidth / 2;

const whiteKeyRow = linearPattern(whiteKey, whiteKeyCount, whiteKeyWidth, 0, 0)
  .translate(keyboardLeft, 0, 0);

const whiteKeys = whiteKeyRow
  .attachTo(keybed, 'top-front', 'bottom-front', [0, -2, 0.1]);

// --- Black keys ---
const blackKey = box(blackKeyWidth, blackKeyDepth, blackKeyHeight, true).color('#111111');
const blackPattern = [0, 1, 3, 4, 5];
const blackKeysList = [];

for (let i = 0; i < whiteKeyCount - 1; i++) {
  if (blackPattern.includes(i % 7)) {
    const x = -keyboardWidth / 2 + (i + 1) * whiteKeyWidth - whiteKeyWidth / 2;
    blackKeysList.push(blackKey.translate(x, 0, 0));
  }
}

const blackKeysRow = union(...blackKeysList);
const blackKeys = blackKeysRow
  .attachTo(keybed, 'top-front', 'bottom-front', [0, whiteKeyDepth * 0.2, 0.1]);

// --- Key slip (front rail) ---
const keySlip = box(keyboardWidth, 12, 6, true)
  .attachTo(keybed, 'bottom-front', 'top-front', [0, -4, -2])
  .color('#1b1b1b');

// --- Music stand ---
const standWidth = keyboardWidth * 0.8;
const standHeight = 50;
const standThickness = 4;

const standBase = box(standWidth, standThickness, standHeight, true)
  .translate(0, 0, standHeight / 2)
  .rotate(-15, 0, 0);

const musicStand = standBase
  .attachTo(body, 'top-front', 'bottom-front', [0, keyboardDepth * 0.6, 0])
  .color('#111111');

// --- Legs ---
const leg = cylinder(legHeight, legRadius).color('#222222');
const legInsetX = bodyWidthActual * 0.08;
const legInsetY = bodyLengthActual * 0.08;

const frontLeftLeg = leg.attachTo(body, 'bottom-front-left', 'top', [legInsetX, legInsetY, 0]);
const frontRightLeg = leg.attachTo(body, 'bottom-front-right', 'top', [-legInsetX, legInsetY, 0]);
const backLeg = leg.attachTo(body, 'bottom-back-right', 'top', [-legInsetX, -legInsetY, 0]);

// --- Casters ---
const caster = sphere(legRadius * 0.6).color('#555555');
const casterFL = caster.attachTo(frontLeftLeg, 'bottom', 'top');
const casterFR = caster.attachTo(frontRightLeg, 'bottom', 'top');
const casterBack = caster.attachTo(backLeg, 'bottom', 'top');

// --- Pedal rail + pedals ---
const pedalRail = box(50, 14, 6, true)
  .translate(0, frontY + keyboardDepth * 0.5, legHeight * 0.35)
  .color('#bfa14a');

const pedalBlade = box(4, 18, 2, true).rotate(10, 0, 0).color('#d8b45a');
const pedalSpacing = 12;

const pedalL = pedalBlade.attachTo(pedalRail, 'top', 'bottom', [-pedalSpacing, 0, 0]);
const pedalM = pedalBlade.attachTo(pedalRail, 'top', 'bottom', [0, 0, 0]);
const pedalR = pedalBlade.attachTo(pedalRail, 'top', 'bottom', [pedalSpacing, 0, 0]);

// --- Bench ---
const benchWidth = keyboardWidth * 0.6;
const benchDepth = keyboardDepth * 0.6;
const benchSeatThickness = 6;
const benchHeight = legHeight * 0.7;

const benchSeat = box(benchWidth, benchDepth, benchSeatThickness, true)
  .translate(0, frontY - keyboardDepth * 0.9, benchHeight + benchSeatThickness / 2)
  .color('#3b2a1a');

const benchLeg = cylinder(benchHeight, 4).color('#2b1f14');
const benchInsetX = benchWidth / 2 - 8;
const benchInsetY = benchDepth / 2 - 6;

const benchLegFL = benchLeg.attachTo(benchSeat, 'bottom-front-left', 'top', [benchInsetX, benchInsetY, 0]);
const benchLegFR = benchLeg.attachTo(benchSeat, 'bottom-front-right', 'top', [-benchInsetX, benchInsetY, 0]);
const benchLegBL = benchLeg.attachTo(benchSeat, 'bottom-back-left', 'top', [benchInsetX, -benchInsetY, 0]);
const benchLegBR = benchLeg.attachTo(benchSeat, 'bottom-back-right', 'top', [-benchInsetX, -benchInsetY, 0]);

return [
  { name: "Piano Body", shape: body },
  { name: "Soundboard", shape: soundboard },
  { name: "Lid", shape: lid },
  { name: "Keybed", shape: keybed },
  { name: "White Keys", shape: whiteKeys },
  { name: "Black Keys", shape: blackKeys },
  { name: "Key Slip", shape: keySlip },
  { name: "Music Stand", shape: musicStand },
  { name: "Front Left Leg", shape: frontLeftLeg },
  { name: "Front Right Leg", shape: frontRightLeg },
  { name: "Back Leg", shape: backLeg },
  { name: "Caster Front Left", shape: casterFL },
  { name: "Caster Front Right", shape: casterFR },
  { name: "Caster Back", shape: casterBack },
  { name: "Pedal Rail", shape: pedalRail },
  { name: "Pedal Left", shape: pedalL },
  { name: "Pedal Middle", shape: pedalM },
  { name: "Pedal Right", shape: pedalR },
  { name: "Bench Seat", shape: benchSeat },
  { name: "Bench Leg FL", shape: benchLegFL },
  { name: "Bench Leg FR", shape: benchLegFR },
  { name: "Bench Leg BL", shape: benchLegBL },
  { name: "Bench Leg BR", shape: benchLegBR },
];

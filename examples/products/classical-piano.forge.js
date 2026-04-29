/*
  Classical Grand Piano — detailed example assembly.

  Major parts:
  - Curved grand body with hollow rim
  - Soundboard
  - Opening lid with prop stick
  - Keybed with white + black keys and fallboard
  - Music stand (shaped, angled)
  - Three tapered legs with casters
  - Pedal rail and pedals
  - Bench
*/

const bodyWidth = Param.number("Body Width", 180, { min: 140, max: 240, unit: "mm" });
const bodyLength = Param.number("Body Length", 280, { min: 220, max: 360, unit: "mm" });
const rimHeight = Param.number("Rim Height", 28, { min: 20, max: 40, unit: "mm" });
const lidThickness = Param.number("Lid Thickness", 6, { min: 4, max: 10, unit: "mm" });
const lidOpen = Param.number("Lid Angle", 25, { min: 0, max: 50, unit: "°" });
const legHeight = Param.number("Leg Height", 60, { min: 45, max: 90, unit: "mm" });
const legTopRadius = Param.number("Leg Top Radius", 8, { min: 5, max: 12, unit: "mm" });
const keyboardDepth = Param.number("Keyboard Depth", 60, { min: 45, max: 80, unit: "mm" });
const keyHeight = Param.number("Key Height", 5, { min: 3, max: 8, unit: "mm" });

const rimThickness = Math.min(12, bodyWidth * 0.07);
const keyboardWidth = bodyWidth * 0.9;
const keybedHeight = 8;
const legBottomRadius = legTopRadius * 0.6;

const whiteKeyCount = 52;
const whiteKeyWidth = keyboardWidth / whiteKeyCount;
const whiteKeyDepth = keyboardDepth * 0.9;

const blackKeyWidth = whiteKeyWidth * 0.6;
const blackKeyDepth = whiteKeyDepth * 0.6;
const blackKeyHeight = keyHeight * 1.4;

function centeredBox(width, depth, height) {
  return box(width, depth, height).translate(0, 0, -height / 2);
}

// --- Body outline (grand-style curve via constrained sketch with arcs) ---
// Grand piano outline: straight keyboard edge (front/−Y), straight left side,
// large sweeping curve around the tail, and a curved right side (bent side).
const halfW = bodyWidth / 2;
const halfL = bodyLength / 2;

// Key control points for the outline (CCW winding)
const cs = constrainedSketch();

// Front-left corner (keyboard left end)
const pFL = cs.point(-halfW * 0.85, -halfL, true);
// Front-right corner (keyboard right end, wider because of the bent side)
const pFR = cs.point(halfW * 0.55, -halfL, true);

// Right side curves outward — bent side inflection points
const pR1 = cs.point(halfW * 0.75, -halfL * 0.4);
const pR2 = cs.point(halfW, halfL * 0.1);

// Tail section — wide sweep at the back
const pTR = cs.point(halfW * 0.7, halfL * 0.7);
const pTail = cs.point(0, halfL);
const pTL = cs.point(-halfW * 0.65, halfL * 0.6);

// Left side — relatively straight
const pL1 = cs.point(-halfW * 0.85, 0);

// Trace the outline: front edge (straight), then arcs around the body
cs.moveTo(-halfW * 0.85, -halfL);
cs.lineTo(halfW * 0.55, -halfL);                  // front edge (keyboard)
cs.arcTo(halfW * 0.75, -halfL * 0.4, halfW * 0.6);  // front-right curve
cs.arcTo(halfW, halfL * 0.1, halfW * 0.5);           // right bent side
cs.arcTo(halfW * 0.7, halfL * 0.7, halfW * 0.6);    // right-to-tail curve
cs.arcTo(0, halfL, halfW * 0.5);                     // tail sweep right
cs.arcTo(-halfW * 0.65, halfL * 0.6, halfW * 0.5);  // tail sweep left
cs.arcTo(-halfW * 0.85, 0, halfW * 0.8);             // left curve back
cs.close();                                            // straight line to start

const outerSketch = cs.solve();
const innerSketch = outerSketch.offset(-rimThickness);

// --- Rim body (hollowed) ---
const rimOuter = outerSketch.extrude(rimHeight);
const rimInner = innerSketch.extrude(rimHeight - 4).translate(0, 0, 2);

const body = rimOuter
  .subtract(rimInner)
  .translate(0, 0, legHeight)
  .color('#111111');

const bodyBB = body.boundingBox();
const [leftX, frontY, bottomZ] = bodyBB.min;
const [rightX, backY, topZ] = bodyBB.max;
const bodyWidthActual = rightX - leftX;
const bodyLengthActual = backY - frontY;
const bodyCenterX = (leftX + rightX) / 2;
const bodyCenterY = (frontY + backY) / 2;

// --- Soundboard ---
const soundboard = innerSketch
  .extrude(2)
  .attachTo(body, 'top', 'top', [0, 0, -2])
  .color('#c8a96a');

// --- Lid (hinges at the back-left edge) ---
const lidSketch = outerSketch.offset(-rimThickness * 0.2);
const lidRaw = lidSketch.extrude(lidThickness);

// Position the lid on top of the body, then rotate around the back edge (X axis at back-left)
const lidOnTop = lidRaw.attachTo(body, 'top-left', 'bottom-left');
const hingeY = backY;
const hingeZ = topZ;
const lid = lidOnTop
  .rotateAroundAxis([1, 0, 0], -lidOpen, [0, hingeY, hingeZ])
  .color('#111111');

// --- Lid prop stick ---
// Base sits on the soundboard; top touches the underside of the open lid.
const propRadius = 1.5;
const propBaseX = bodyCenterX + bodyWidthActual * 0.15;
const propBaseY = bodyCenterY;
const propBaseZ = topZ;

// The lid rotates around [1,0,0] at (hingeY, hingeZ). A point on the lid's
// underside at propBaseY (before rotation) swings to a new Y/Z after rotation.
const dy = propBaseY - hingeY;  // negative (prop is in front of hinge)
const rad = lidOpen * Math.PI / 180;
const propTopY = hingeY + dy * Math.cos(rad);
const propTopZ = hingeZ - dy * Math.sin(rad) - lidThickness;

const propStick = union(
  sphere(propRadius).translate(propBaseX, propBaseY, propBaseZ),
  sphere(propRadius).translate(propBaseX, propTopY, propTopZ),
).color('#8B7355');

// --- Keybed ---
const keybed = centeredBox(keyboardWidth, keyboardDepth, keybedHeight)
  .attachTo(body, 'top-front', 'top-front', [0, 0, -2])
  .color('#222222');

// --- White keys ---
const whiteKey = centeredBox(whiteKeyWidth * 0.98, whiteKeyDepth, keyHeight).color('#f5f5f5');
const keyboardLeft = -keyboardWidth / 2 + whiteKeyWidth / 2;

const whiteKeyRow = linearPattern(whiteKey, whiteKeyCount, whiteKeyWidth, 0, 0)
  .translate(keyboardLeft, 0, 0);

const whiteKeys = whiteKeyRow
  .attachTo(keybed, 'top-front', 'bottom-front', [0, -2, 0.1]);

// --- Black keys ---
const blackKey = centeredBox(blackKeyWidth, blackKeyDepth, blackKeyHeight).color('#111111');
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

// --- Key slip (front rail below keyboard) ---
const keySlip = centeredBox(keyboardWidth, 12, 6)
  .attachTo(keybed, 'bottom-front', 'top-front', [0, -4, -2])
  .color('#1b1b1b');

// --- Fallboard (keyboard cover, resting behind the keys) ---
const fallboard = centeredBox(keyboardWidth, 4, keybedHeight + keyHeight + 2)
  .attachTo(keybed, 'top-back', 'bottom-front', [0, 2, 0])
  .color('#111111');

// --- Music stand (shaped, angled behind keyboard) ---
const standWidth = keyboardWidth * 0.8;
const standHeight = 45;
const standThickness = 3;
const standLipHeight = 8;
const standLipDepth = 6;

// Main panel of the music stand
const standPanel = centeredBox(standWidth, standThickness, standHeight)
  .translate(0, 0, standHeight / 2);

// Bottom lip to hold sheet music
const standLip = centeredBox(standWidth, standLipDepth, standLipHeight)
  .attachTo(standPanel, 'bottom-front', 'bottom-back', [0, 0, 0]);

// Combine panel + lip, tilt back, then position behind the fallboard
const standAssembly = group(standPanel, standLip)
  .rotateX(-12);

// Position the music stand so it sits above the soundboard, behind the keyboard area
const keybedBB = keybed.boundingBox();
const musicStand = standAssembly
  .translate(
    bodyCenterX,
    keybedBB.max[1] + keyboardDepth * 0.3,
    topZ + 2,
  )
  .color('#111111');

// --- Legs (tapered, touching body bottom) ---
const leg = cylinder(legHeight, legTopRadius, legBottomRadius).color('#222222');

// Position legs directly at body bottom, inset from the actual shape edges
const legInsetX = bodyWidthActual * 0.12;
const legInsetY = bodyLengthActual * 0.12;

const frontLeftLeg = leg.attachTo(body, 'bottom-front-left', 'top', [legInsetX, legInsetY, 0]);
const frontRightLeg = leg.attachTo(body, 'bottom-front-right', 'top', [-legInsetX, legInsetY, 0]);
const backLeg = leg.attachTo(body, 'bottom-back', 'top', [0, -legInsetY, 0]);

// --- Casters (small wheels at bottom of legs) ---
const caster = sphere(legBottomRadius * 0.8).color('#555555');
const casterFL = caster.attachTo(frontLeftLeg, 'bottom', 'top');
const casterFR = caster.attachTo(frontRightLeg, 'bottom', 'top');
const casterBack = caster.attachTo(backLeg, 'bottom', 'top');

// --- Pedal rail + pedals ---
// Horizontal brace between front legs
const frontLeftBB = frontLeftLeg.boundingBox();
const frontRightBB = frontRightLeg.boundingBox();
const pedalRailY = (frontLeftBB.min[1] + frontLeftBB.max[1]) / 2;
const pedalRailZ = legHeight * 0.15;

const pedalRail = centeredBox(50, 14, 6)
  .translate(bodyCenterX, pedalRailY, pedalRailZ)
  .color('#bfa14a');

const pedalBlade = centeredBox(4, 18, 2).rotateX(10).color('#d8b45a');
const pedalSpacing = 12;

const pedalL = pedalBlade.attachTo(pedalRail, 'top', 'bottom', [-pedalSpacing, 0, 0]);
const pedalM = pedalBlade.attachTo(pedalRail, 'top', 'bottom', [0, 0, 0]);
const pedalR = pedalBlade.attachTo(pedalRail, 'top', 'bottom', [pedalSpacing, 0, 0]);

// --- Bench ---
const benchWidth = keyboardWidth * 0.6;
const benchDepth = keyboardDepth * 0.6;
const benchSeatThickness = 6;
const benchHeight = legHeight * 0.7;

const benchSeat = centeredBox(benchWidth, benchDepth, benchSeatThickness)
  .translate(bodyCenterX, frontY - keyboardDepth * 0.9, benchHeight + benchSeatThickness / 2)
  .color('#3b2a1a');

const benchLeg = cylinder(benchHeight, 4, 3).color('#2b1f14');
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
  { name: "Lid Prop", shape: propStick },
  { name: "Keybed", shape: keybed },
  { name: "White Keys", shape: whiteKeys },
  { name: "Black Keys", shape: blackKeys },
  { name: "Key Slip", shape: keySlip },
  { name: "Fallboard", shape: fallboard },
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

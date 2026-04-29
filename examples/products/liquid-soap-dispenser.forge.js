// Liquid Soap Dispenser — staged dispense animation without fluid simulation.
// Move "Dispense Progress" from 0 → 100 to preview one pump cycle.

const bodyH = Param.number("Bottle Height", 130, { min: 90, max: 180, unit: "mm" });
const bodyR = Param.number("Bottle Radius", 34, { min: 24, max: 45, unit: "mm" });
const wall = Param.number("Wall Thickness", 2.8, { min: 1.5, max: 5, unit: "mm" });
const pumpStroke = Param.number("Pump Stroke", 10, { min: 4, max: 18, unit: "mm" });
const progressPct = Param.number("Dispense Progress", 0, { min: 0, max: 100, unit: "%" });

const progress = progressPct / 100;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Press down (0..0.6), then spring release (0.6..1.0).
const pressIn = clamp01(progress / 0.6);
const release = clamp01((progress - 0.6) / 0.4);
const press = progress <= 0.6 ? pressIn : 1 - release;

// Add a center slice so internals are inspectable.
cutPlane("Middle Slice", [0, -1, 0], 0);

const neckH = 16;
const neckR = bodyR * 0.36;
const chamberH = 48;
const chamberR = neckR * 0.9;
const chamberWall = 2.4;
const chamberInnerR = chamberR - chamberWall;
const chamberBottomZ = bodyH + 4;
const chamberTopZ = chamberBottomZ + chamberH;

const headW = 54;
const headD = 22;
const headH = 14;
const headRestZ = chamberTopZ + 14;
const headZ = headRestZ - press * pumpStroke;

const nozzleL = 34;
const nozzleR = 3.6;
const nozzleRootX = headW * 0.22;
const nozzleCenterX = nozzleRootX + nozzleL * 0.5;
const nozzleTipX = nozzleRootX + nozzleL;
const nozzleZ = headZ + 1;

// Bottle shell + neck.
const bottleOuter = cylinder(bodyH, bodyR, bodyR)
  .translate(0, 0, bodyH * 0.5);
const bottleInner = cylinder(bodyH - wall * 1.4, bodyR - wall, bodyR - wall)
  .translate(0, 0, wall + (bodyH - wall * 1.4) * 0.5);
const bottleShell = bottleOuter.subtract(bottleInner);

const neckOuter = cylinder(neckH, neckR, neckR).translate(0, 0, bodyH + neckH * 0.5 - 2);
const neckHole = cylinder(neckH + 6, chamberR - 2.5, chamberR - 2.5)
  .translate(0, 0, bodyH + neckH * 0.5 - 2);
const bottle = union(bottleShell, neckOuter).subtract(neckHole);

// Pump chamber.
const chamberOuter = cylinder(chamberH, chamberR, chamberR)
  .translate(0, 0, chamberBottomZ + chamberH * 0.5);
const chamberInner = cylinder(chamberH - 4, chamberInnerR, chamberInnerR)
  .translate(0, 0, chamberBottomZ + chamberH * 0.5 + 1.2);
const chamberShell = chamberOuter.subtract(chamberInner);

// Pump head + nozzle.
const head = box(headW, headD, headH).translate(0, 0, headZ);
const nozzleOuter = cylinder(nozzleL, nozzleR, nozzleR * 0.92)
  .pointAlong([1, 0, 0])
  .translate(nozzleCenterX, 0, nozzleZ);
const nozzleInner = cylinder(nozzleL + 2, 1.5, 1.35)
  .pointAlong([1, 0, 0])
  .translate(nozzleCenterX, 0, nozzleZ);
const nozzle = nozzleOuter.subtract(nozzleInner);

// Stem + piston (moves with the head).
const pistonH = 7;
const pistonZ = chamberTopZ - 8 - press * pumpStroke * 0.9;
const piston = cylinder(pistonH, chamberR - 3.1, chamberR - 3.1).translate(0, 0, pistonZ);

const stemTopZ = headZ - headH * 0.5;
const stemBottomZ = pistonZ + pistonH * 0.5;
const stemLen = Math.max(8, stemTopZ - stemBottomZ);
const stem = cylinder(stemLen, 2.2, 2.2).translate(0, 0, (stemTopZ + stemBottomZ) * 0.5);

// Return spring shown as compressed ring stack.
const springBottomZ = chamberBottomZ + 8;
const springTopZ = pistonZ - pistonH * 0.7;
const springSpan = Math.max(6, springTopZ - springBottomZ);
const springTurns = 7;
const springRings = [];
for (let i = 0; i < springTurns; i++) {
  const t = i / Math.max(1, springTurns - 1);
  const z = springBottomZ + t * springSpan;
  const ringOuter = cylinder(1.2, chamberR - 4.2, chamberR - 4.2).translate(0, 0, z);
  const ringInner = cylinder(2.4, chamberR - 5.3, chamberR - 5.3).translate(0, 0, z);
  springRings.push(ringOuter.subtract(ringInner));
}
const spring = union(...springRings);

// Dip tube.
const tubeBottomZ = 8;
const tubeTopZ = chamberBottomZ + 6;
const tubeLen = tubeTopZ - tubeBottomZ;
const tubeOuter = cylinder(tubeLen, 2.5, 2.5).translate(0, 0, (tubeBottomZ + tubeTopZ) * 0.5);
const tubeInner = cylinder(tubeLen + 2, 1.2, 1.2).translate(0, 0, (tubeBottomZ + tubeTopZ) * 0.5);
const dipTube = tubeOuter.subtract(tubeInner);

// Check valves: inlet opens during release, outlet opens during press.
const inletSeatZ = chamberBottomZ + 3;
const outletSeatZ = chamberTopZ - 7;
const inletValve = sphere(2.7).translate(0, 0, inletSeatZ + release * 2.4);
const outletValveR = 2.2;
const outletSeatClearance = 0.35;
const outletSeatX = chamberInnerR - outletValveR - outletSeatClearance;
const outletValve = sphere(outletValveR).translate(outletSeatX - press * 0.9, 0, outletSeatZ + 0.6 + press * 0.9);

// Stylized liquid storyboarding (no simulation).
const drawPhase = clamp01(progress / 0.55);
const pushPhase = clamp01((progress - 0.42) / 0.34);

const reservoirLevel = bodyH * 0.62;
const reservoir = cylinder(reservoirLevel, bodyR - wall - 1, bodyR - wall - 1)
  .translate(0, 0, 4 + reservoirLevel * 0.5);

const tubeSlugH = 6 + drawPhase * (tubeLen - 10);
const tubeLiquid = cylinder(tubeSlugH, 1.1, 1.1)
  .translate(0, 0, tubeBottomZ + tubeSlugH * 0.5);

const chamberLiquidH = Math.max(2, 9 + drawPhase * 17 - pushPhase * 16);
const chamberLiquid = cylinder(chamberLiquidH, chamberR - 4.8, chamberR - 4.8)
  .translate(0, 0, chamberBottomZ + 4 + chamberLiquidH * 0.5);

const flowIn = clamp01((progress - 0.45) / 0.2);
const flowOut = 1 - clamp01((progress - 0.8) / 0.15);
const nozzleFlow = clamp01(flowIn * flowOut);
const nozzleLiquidLen = Math.max(1, 1 + nozzleFlow * (nozzleL - 3));
const nozzleLiquid = cylinder(nozzleLiquidLen, 1.05, 0.95)
  .pointAlong([1, 0, 0])
  .translate(nozzleRootX + nozzleLiquidLen * 0.5, 0, nozzleZ);

const dropPhase = clamp01((progress - 0.68) / 0.32);
const dropR = dropPhase * 2.1;
const dropFall = clamp01((dropPhase - 0.45) / 0.55);
const droplet = dropR > 0.12
  ? sphere(dropR).translate(nozzleTipX + 1.5, 0, nozzleZ - 2 - dropFall * 16)
  : null;

const liquidParts = [reservoir, tubeLiquid, chamberLiquid, nozzleLiquid];
if (droplet) liquidParts.push(droplet);
const liquid = union(...liquidParts);

const pumpMetal = union(chamberShell, dipTube, stem, piston, spring, nozzle);
const pumpHead = head;

return [
  { name: "Bottle", shape: bottle, color: "#f4f1ea" },
  { name: "Pump Head", shape: pumpHead, color: "#303840" },
  { name: "Pump Mechanics", shape: pumpMetal, color: "#a9b2bb" },
  { name: "Inlet Valve", shape: inletValve, color: "#6f7a85" },
  { name: "Outlet Valve", shape: outletValve, color: "#6f7a85" },
  { name: "Liquid (Stylized)", shape: liquid, color: "#4fa6d8" },
];

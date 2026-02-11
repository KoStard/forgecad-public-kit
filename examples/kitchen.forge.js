// Modern Kitchen — L-shaped counter with appliances
// Demonstrates: multi-object scene, colors, parametric layout

const counterW = param("Counter Width", 2400, { min: 1800, max: 3500, unit: "mm" });
const counterD = param("Counter Depth", 600, { min: 500, max: 800, unit: "mm" });
const counterH = param("Counter Height", 900, { min: 800, max: 1000, unit: "mm" });
const sideLen = param("Side Length", 1600, { min: 1000, max: 2500, unit: "mm" });
const cabinetH = param("Cabinet Height", 720, { min: 600, max: 850, unit: "mm" });
const topT = param("Countertop Thick", 30, { min: 15, max: 50, unit: "mm" });
const kickH = 100;
const kickD = 50;

// ─── Base cabinets (L-shape) ───

// Main run along back wall
const mainCab = box(counterW, counterD, cabinetH)
  .translate(0, 0, counterH - cabinetH - topT);

// Side run perpendicular
const sideCab = box(counterD, sideLen - counterD, cabinetH)
  .translate(0, counterD, counterH - cabinetH - topT);

// Kick plates (recessed at bottom)
const mainKick = box(counterW, counterD - kickD, kickH)
  .translate(0, kickD, 0);
const sideKick = box(counterD - kickD, sideLen - counterD, kickH)
  .translate(kickD, counterD, 0);

const cabinets = union(mainCab, sideCab).subtract(mainKick).subtract(sideKick);

// Cabinet doors — vertical lines
const doorGap = 2;
const doorW = 500;
const doorCount = Math.floor(counterW / doorW);
const doorLines = [];
for (let i = 1; i < doorCount; i++) {
  doorLines.push(
    box(doorGap, 3, cabinetH)
      .translate(i * doorW, counterD - 1, counterH - cabinetH - topT)
  );
}
// Side cabinet doors
const sideDoorCount = Math.floor((sideLen - counterD) / doorW);
for (let i = 1; i < sideDoorCount; i++) {
  doorLines.push(
    box(3, doorGap, cabinetH)
      .translate(counterD - 1, counterD + i * doorW, counterH - cabinetH - topT)
  );
}

// Handles — horizontal bars on each door
const handles = [];
const handleW = 120;
const handleH = 10;
const handleZ = counterH - cabinetH - topT + cabinetH * 0.75;
for (let i = 0; i < doorCount; i++) {
  handles.push(
    box(handleW, 8, handleH, true)
      .translate(i * doorW + doorW / 2, counterD + 4, handleZ)
  );
}
for (let i = 0; i < sideDoorCount; i++) {
  handles.push(
    box(8, handleW, handleH, true)
      .translate(counterD + 4, counterD + i * doorW + doorW / 2, handleZ)
  );
}

const allHandles = handles.length > 0 ? union(...handles) : box(1, 1, 1);
const allDoorLines = doorLines.length > 0 ? union(...doorLines) : box(1, 1, 1);

// ─── Countertop ───

const mainTop = box(counterW + 20, counterD + 20, topT)
  .translate(-10, -10, counterH - topT);
const sideTop = box(counterD + 20, sideLen - counterD + 10, topT)
  .translate(-10, counterD, counterH - topT);
const countertop = union(mainTop, sideTop);

// ─── Sink (in main counter) ───

const sinkW = param("Sink Width", 500, { min: 350, max: 700, unit: "mm" });
const sinkD = 400;
const sinkDepth = 180;
const sinkX = counterW * 0.4;

const sinkOuter = box(sinkW, sinkD, sinkDepth + topT, true);
const sinkInner = box(sinkW - 20, sinkD - 20, sinkDepth + topT + 2, true);
const sinkBowl = sinkOuter.subtract(sinkInner)
  .translate(sinkX, counterD / 2, counterH - sinkDepth / 2);

// Drain
const drain = cylinder(sinkDepth + topT + 2, 20)
  .translate(sinkX, counterD / 2, counterH - sinkDepth - topT);

// Faucet
const faucetBase = cylinder(40, 15, undefined, 24)
  .translate(sinkX, counterD * 0.15, counterH);
const faucetArm = box(12, 180, 12, true)
  .translate(sinkX, counterD * 0.15 + 90, counterH + 40 + 6);
const faucetNeck = cylinder(50, 6, undefined, 16)
  .translate(sinkX, counterD * 0.15, counterH);
const faucetSpout = cylinder(30, 4, undefined, 12)
  .translate(sinkX, counterD / 2, counterH + 30);

const faucet = union(faucetBase, faucetNeck, faucetArm, faucetSpout);

// Cut sink hole in countertop
const sinkHole = box(sinkW - 10, sinkD - 10, topT + 2, true)
  .translate(sinkX, counterD / 2, counterH - topT / 2);

// ─── Stovetop (right side of main counter) ───

const stoveX = counterW * 0.78;
const stoveW = 580;
const stoveD = 510;

// Stovetop surface (slightly raised)
const stoveSurface = box(stoveW, stoveD, 3, true)
  .translate(stoveX, counterD / 2, counterH + 1.5);

// Burners — 4 circles
const burnerPositions = [
  [-120, -100], [120, -100],
  [-120, 100], [120, 100],
];
const burnerRings = [];
for (const [bx, by] of burnerPositions) {
  const r = Math.abs(by) < 50 ? 90 : 70; // back burners larger
  const ring = circle2d(r).subtract(circle2d(r - 8))
    .extrude(2)
    .translate(stoveX + bx, counterD / 2 + by, counterH + 3);
  burnerRings.push(ring);
}
const burners = union(...burnerRings);

// Knobs (front of stove area)
const knobs = [];
for (let i = 0; i < 4; i++) {
  knobs.push(
    cylinder(8, 12, undefined, 24)
      .translate(stoveX - 180 + i * 120, counterD + 5, counterH - topT + cabinetH * 0.92)
  );
}
const stoveKnobs = union(...knobs);

// ─── Range hood (above stove) ───

const hoodW = stoveW + 60;
const hoodD = counterD - 50;
const hoodH = 120;
const hoodZ = counterH + 650;

const hoodBody = box(hoodW, hoodD, hoodH, true)
  .translate(stoveX, counterD / 2, hoodZ);
// Chimney
const chimneyW = hoodW * 0.4;
const chimneyH = 400;
const chimney = box(chimneyW, hoodD * 0.5, chimneyH, true)
  .translate(stoveX, counterD / 2, hoodZ + hoodH / 2 + chimneyH / 2);

const rangeHood = union(hoodBody, chimney);

// ─── Upper cabinets (on back wall above counter) ───

const upperH = param("Upper Cab Height", 700, { min: 500, max: 900, unit: "mm" });
const upperD = 350;
const upperZ = counterH + 500;
const upperW = counterW * 0.35; // left section only (right has hood)

const upperCab = box(upperW, upperD, upperH)
  .translate(0, 0, upperZ);

// Upper door lines
const upperDoorW = upperW / 2;
const upperDoorLine = box(doorGap, 3, upperH)
  .translate(upperDoorW, upperD - 1, upperZ);

// Upper handles
const upperHandle1 = box(handleW, 8, handleH, true)
  .translate(upperDoorW / 2, upperD + 4, upperZ + upperH * 0.2);
const upperHandle2 = box(handleW, 8, handleH, true)
  .translate(upperDoorW + upperDoorW / 2, upperD + 4, upperZ + upperH * 0.2);

const upperSection = union(upperCab, upperDoorLine);
const upperHandles = union(upperHandle1, upperHandle2);

// ─── Refrigerator (at far left end) ───

const fridgeW = param("Fridge Width", 700, { min: 600, max: 900, unit: "mm" });
const fridgeD = 650;
const fridgeH = 1800;
const fridgeX = -fridgeW - 30; // left of counter

const fridgeBody = box(fridgeW, fridgeD, fridgeH)
  .translate(fridgeX, 0, 0);

// Fridge door split (top 60%, bottom 40%)
const splitZ = fridgeH * 0.4;
const fridgeSplit = box(fridgeW + 2, 3, 3)
  .translate(fridgeX - 1, fridgeD - 1, splitZ);

// Fridge handles
const fridgeHandleTop = box(8, 30, 250, true)
  .translate(fridgeX + fridgeW - 30, fridgeD + 15, splitZ + (fridgeH - splitZ) / 2);
const fridgeHandleBot = box(8, 30, 150, true)
  .translate(fridgeX + fridgeW - 30, fridgeD + 15, splitZ / 2);

const fridge = union(fridgeBody, fridgeSplit);
const fridgeHandles = union(fridgeHandleTop, fridgeHandleBot);

// ─── Assemble ───

const counterWithSink = countertop.subtract(sinkHole);
const cabsWithLines = cabinets.subtract(allDoorLines);

return [
  { name: "Cabinets", shape: cabsWithLines, color: "#f5f0e8" },
  { name: "Handles", shape: allHandles, color: "#888888" },
  { name: "Countertop", shape: counterWithSink, color: "#404040" },
  { name: "Sink", shape: sinkBowl.subtract(drain), color: "#c0c0c0" },
  { name: "Faucet", shape: faucet, color: "#a0a0a0" },
  { name: "Stove Surface", shape: stoveSurface, color: "#1a1a1a" },
  { name: "Burners", shape: burners, color: "#cc3300" },
  { name: "Stove Knobs", shape: stoveKnobs, color: "#333333" },
  { name: "Range Hood", shape: rangeHood, color: "#c0c0c0" },
  { name: "Upper Cabinets", shape: union(upperSection), color: "#f5f0e8" },
  { name: "Upper Handles", shape: upperHandles, color: "#888888" },
  { name: "Refrigerator", shape: fridge, color: "#d0d0d0" },
  { name: "Fridge Handles", shape: fridgeHandles, color: "#888888" },
];

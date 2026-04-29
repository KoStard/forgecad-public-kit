// CoreXY 3D Printer — Bambu-style with proper clearances
// Z-up, Y = depth (front/back), X = width (left/right)
//
// Printing model: bed starts near nozzle, lowers as layers build up.
// Bed Z param represents current print progress (high = start, low = done).

// ─── Parameters ───
const bedW = Param.number("Bed Width", 220, { min: 180, max: 300, unit: "mm" });
const bedD = Param.number("Bed Depth", 220, { min: 180, max: 300, unit: "mm" });
const bedThick = Param.number("Bed Thickness", 4, { min: 3, max: 8, unit: "mm" });
const frameMargin = Param.number("Frame Margin", 40, { min: 20, max: 80, unit: "mm" });
const beam = Param.number("Beam Size", 20, { min: 15, max: 30, unit: "mm" });
const frameH = Param.number("Frame Height", 400, { min: 320, max: 520, unit: "mm" });

// ─── Derived frame ───
const frameW = bedW + 2 * frameMargin;
const frameD = bedD + 2 * frameMargin;
const innerW = frameW - 2 * beam;
const innerD = frameD - 2 * beam;
const railR = 4;

// Gantry sits near the top of the frame
const gantryZ = frameH - 80;
const nozzleToRail = 55;
const nozzleZ = gantryZ - nozzleToRail;

// Bed starts near nozzle tip and lowers during printing.
const bedTopMax = nozzleZ - 1;
const bedTopMin = beam + bedThick + 80;
const bedZ = Param.number("Bed Z (print progress)", bedTopMax, {
  min: bedTopMin, max: bedTopMax, unit: "mm",
});

// Gantry XY travel
const gantryTravel = innerD / 2 - 30;
const gantryY = Param.number("Gantry Y", 0, { min: -gantryTravel, max: gantryTravel, unit: "mm" });
const headTravel = innerW / 2 - 50;
const headX = Param.number("Nozzle X", 0, { min: -headTravel, max: headTravel, unit: "mm" });

// ─── Colors ───
const C = {
  frame: "#555555", bed: "#c45c1a", glass: "#6bb6ff",
  carriage: "#888888", rail: "#c0c0c0", lead: "#999999",
  belt: "#222222", motor: "#444444", electronics: "#666666",
  screen: "#00ccff", nozzle: "#b87333", hotend: "#999999",
  fan: "#333333", spool: "#dddddd", filament: "#cc4444",
  buildVol: "#33ccff",
};

const parts = [];
const add = (name, shape, color) =>
  parts.push({ name, shape: color ? shape.color(color) : shape });

// ─── Frame ───
const fp = [];
const bz = beam / 2;
const tz = frameH - beam / 2;
const pH = frameH - 2 * beam;
const pZ = beam + pH / 2;
const hw = frameW / 2 - beam / 2;
const hd = frameD / 2 - beam / 2;

for (const z of [bz, tz]) {
  for (const sy of [-1, 1])
    fp.push(box(frameW, beam, beam).translate(0, sy * hd, z));
  for (const sx of [-1, 1])
    fp.push(box(beam, frameD - 2 * beam, beam).translate(sx * hw, 0, z));
}
for (const sx of [-1, 1])
  for (const sy of [-1, 1])
    fp.push(box(beam, beam, pH).translate(sx * hw, sy * hd, pZ));

add("Frame", union(...fp), C.frame);

// ─── Z-Axis: rails + lead screws at rear corners ───
// Z rails only extend from bottom beam to just below gantry zone
const zRailInsetX = 25;
const zRailX = innerW / 2 - zRailInsetX;
const zRailY = innerD / 2 - 5; // flush with rear inner wall
const zTopClearance = gantryZ - 40; // stop well below gantry
const zLen = zTopClearance - beam - 10;
const zBase = beam + 10;

add("Z Rails", union(
  cylinder(zLen, railR).translate(-zRailX, zRailY, zBase),
  cylinder(zLen, railR).translate(zRailX, zRailY, zBase),
), C.rail);

const leadY = zRailY - 10; // lead screws just forward of rails, but behind bed edge
add("Lead Screws", union(
  cylinder(zLen - 10, 4).translate(-zRailX, leadY, zBase),
  cylinder(zLen - 10, 4).translate(zRailX, leadY, zBase),
), C.lead);

add("Z Motors", union(
  box(42, 42, 40).translate(-zRailX, leadY, beam + 20),
  box(42, 42, 40).translate(zRailX, leadY, beam + 20),
), C.motor);

// ─── Bed Assembly (moves in Z) ───
const glassThick = 2;
const glassTopZ = bedZ;
const bedPlateTopZ = glassTopZ - glassThick;
const bedPlateCenterZ = bedPlateTopZ - bedThick / 2;

const bedPlate = box(bedW, bedD, bedThick).translate(0, 0, bedPlateCenterZ);
const glass = box(bedW - 6, bedD - 6, glassThick)
  .translate(0, 0, bedPlateTopZ + glassThick / 2);

const carriageThick = 8;
const springH = 12;
const carriageZ = bedPlateCenterZ - bedThick / 2 - springH - carriageThick / 2;

// Carriage narrower in Y so it doesn't extend past the Z rail Y position
const bedCarriage = box(bedW + 20, bedD - 40, carriageThick)
  .translate(0, 0, carriageZ);

add("Z Bearings", union(
  box(24, 24, 16).translate(-zRailX, zRailY, carriageZ),
  box(24, 24, 16).translate(zRailX, zRailY, carriageZ),
), C.carriage);

add("Lead Nuts", union(
  cylinder(8, 6).translate(-zRailX, leadY, carriageZ),
  cylinder(8, 6).translate(zRailX, leadY, carriageZ),
), C.lead);

const spX = bedW / 2 - 25;
const spY = bedD / 2 - 25;
const springs = [];
for (const sx of [-1, 1])
  for (const sy of [-1, 1])
    springs.push(cylinder(springH, 3).translate(
      sx * spX, sy * spY, bedPlateCenterZ - bedThick / 2 - springH));

add("Bed Plate", bedPlate, C.bed);
add("Glass Surface", glass, C.glass);
add("Bed Carriage", bedCarriage, C.carriage);
add("Leveling Springs", union(...springs), C.lead);

// ─── XY Gantry ───
const yRailLen = innerD - 30;
const yRailX = innerW / 2 - 15;

add("Y Rails", union(
  cylinder(yRailLen, railR).pointAlong([0, 1, 0]).translate(-yRailX, -yRailLen / 2, gantryZ),
  cylinder(yRailLen, railR).pointAlong([0, 1, 0]).translate(yRailX, -yRailLen / 2, gantryZ),
), C.rail);

add("Y Carriages", union(
  box(28, 32, 18).translate(-yRailX, gantryY, gantryZ),
  box(28, 32, 18).translate(yRailX, gantryY, gantryZ),
), C.carriage);

const xRailLen = yRailX * 2 - 30;
add("X Rail", cylinder(xRailLen, railR).pointAlong([1, 0, 0])
  .translate(-xRailLen / 2, gantryY, gantryZ), C.rail);

// X beam at gantry level — supports the X rail from behind
add("X Beam", box(xRailLen, beam, beam)
  .translate(0, gantryY, gantryZ), C.frame);

// ─── CoreXY Belts ───
const beltZ = gantryZ + 22;
add("XY Belts", union(
  box(xRailLen, 2, 3).translate(0, gantryY + 8, beltZ),
  box(xRailLen, 2, 3).translate(0, gantryY - 8, beltZ),
  box(2, yRailLen, 3).translate(-yRailX, 0, beltZ),
  box(2, yRailLen, 3).translate(yRailX, 0, beltZ),
), C.belt);

// XY motors inside frame at top-rear
const motorSize = 42;
const motorY = innerD / 2 - motorSize / 2 - 5;
add("XY Motors", union(
  box(motorSize, motorSize, motorSize).translate(-yRailX, motorY, gantryZ + 30),
  box(motorSize, motorSize, motorSize).translate(yRailX, motorY, gantryZ + 30),
), C.motor);

add("XY Idlers", union(
  cylinder(8, 6).pointAlong([0, 1, 0]).translate(-yRailX, -yRailLen / 2, beltZ),
  cylinder(8, 6).pointAlong([0, 1, 0]).translate(yRailX, -yRailLen / 2, beltZ),
  cylinder(8, 6).pointAlong([0, 1, 0]).translate(-yRailX, yRailLen / 2, beltZ),
  cylinder(8, 6).pointAlong([0, 1, 0]).translate(yRailX, yRailLen / 2, beltZ),
), C.lead);

// ─── Print Head / Extruder ───
const hx = headX;
const hy = gantryY;

add("Nozzle", cylinder(6, 0.4, 2).translate(hx, hy, nozzleZ), C.nozzle);
add("Heater Block", box(12, 12, 8).translate(hx, hy, nozzleZ + 10), C.hotend);
add("Heatbreak", cylinder(6, 1.5).translate(hx, hy, nozzleZ + 14), C.lead);
add("Heatsink", cylinder(12, 6).translate(hx, hy, nozzleZ + 22), C.hotend);

const headCarriage = box(46, 28, 36).translate(hx, hy, gantryZ - 18);
add("Extruder Carriage", headCarriage, C.carriage);

add("Part Fan", box(18, 8, 16)
  .onFace(headCarriage, 'front', { v: -5, protrude: 5 }), C.fan);

// Extruder motor — compact, sits just above gantry plane
const extruderMotorZ = gantryZ + 5;
add("Extruder Motor", box(30, 30, 20)
  .translate(hx, hy, extruderMotorZ), C.motor);

// ─── Spool Holder (behind frame, on top) ───
const spoolW = 60;
const spoolR = 35;
const spoolY = frameD / 2 + spoolR + 15;
const spoolZ = frameH;

const spoolRod = cylinder(spoolW + 20, 3).pointAlong([1, 0, 0])
  .translate(-(spoolW + 20) / 2, spoolY, spoolZ);
add("Spool Rod", spoolRod, C.lead);

const spoolShell = cylinder(spoolW, spoolR)
  .subtract(cylinder(spoolW + 2, spoolR - 4).translate(0, 0, -1))
  .pointAlong([1, 0, 0])
  .translate(-spoolW / 2, spoolY, spoolZ);
add("Spool Shell", spoolShell, C.spool);
add("Filament Roll", cylinder(spoolW - 4, spoolR - 6).pointAlong([1, 0, 0])
  .translate(-spoolW / 2 + 2, spoolY, spoolZ), C.filament);
add("Spool Hub", cylinder(spoolW, 8).pointAlong([1, 0, 0])
  .translate(-spoolW / 2, spoolY, spoolZ), C.lead);

add("Spool Supports", union(
  box(10, 20, 50).translate(-spoolW / 2 - 15, frameD / 2 - beam / 2, frameH - 25),
  box(10, 20, 50).translate(spoolW / 2 + 15, frameD / 2 - beam / 2, frameH - 25),
), C.frame);

// ─── Filament Path ───
// Simple path: spool → over rear frame beam → down into extruder
const filR = 1.5;
const filBendR = 30;

// Guide tube: spool to top of frame (fixed portion)
const filFixedPath = lib.pipeRoute(
  [
    [0, spoolY, spoolZ],                     // spool center
    [0, frameD / 2 - beam, frameH + 20],     // up and forward over rear beam
    [0, 0, frameH + 20],                     // across top to center
    [hx, hy, extruderMotorZ + 12],           // straight to extruder motor top
  ],
  filR,
  { bendRadius: 25, wall: 0.4, segments: 16 }
);
add("Filament Guide Tube", filFixedPath, C.bowden);

// ─── Electronics ───
add("PSU", box(100, 60, 40)
  .translate(frameW / 2 - 55, -frameD / 2 + 35, 25), C.electronics);

add("Control Board", box(70, 40, 25)
  .translate(-frameW / 2 + 40, -frameD / 2 + 25, 18), C.electronics);

add("Display", box(50, 3, 25)
  .translate(-frameW / 2 + 40, -frameD / 2 + 1, frameH / 3), C.screen);

// ─── Build Volume wireframe ───
const buildH = Math.max(20, nozzleZ - bedTopMin - 5);
const bvr = 0.6;
const bvW = bedW - 10, bvD = bedD - 10;
const bvEdges = [];
const x0 = -bvW / 2, x1 = bvW / 2;
const y0 = -bvD / 2, y1 = bvD / 2;
const z0b = bedTopMin + 5, z1b = z0b + buildH;
for (const y of [y0, y1]) for (const z of [z0b, z1b])
  bvEdges.push(cylinder(bvW, bvr).pointAlong([1, 0, 0]).translate(x0, y, z));
for (const x of [x0, x1]) for (const z of [z0b, z1b])
  bvEdges.push(cylinder(bvD, bvr).pointAlong([0, 1, 0]).translate(x, y0, z));
for (const x of [x0, x1]) for (const y of [y0, y1])
  bvEdges.push(cylinder(buildH, bvr).translate(x, y, z0b));

add("Build Volume", union(...bvEdges), C.buildVol);

// ─── Cut Planes ───
cutPlane("Front Section", [0, -1, 0], 0);
cutPlane("Side Section", [1, 0, 0], 0);
cutPlane("Top Section", [0, 0, 1], gantryZ);

// Assembly groups — intentional overlaps within groups are not flagged
return [
  { name: "Structure", group: [
    parts.find(p => p.name === "Frame"),
    parts.find(p => p.name === "Spool Supports"),
    parts.find(p => p.name === "PSU"),
    parts.find(p => p.name === "Control Board"),
    parts.find(p => p.name === "Display"),
  ]},
  { name: "Z Axis", group: [
    parts.find(p => p.name === "Z Rails"),
    parts.find(p => p.name === "Lead Screws"),
    parts.find(p => p.name === "Z Motors"),
    parts.find(p => p.name === "Z Bearings"),
    parts.find(p => p.name === "Lead Nuts"),
  ]},
  { name: "Bed Assembly", group: [
    parts.find(p => p.name === "Bed Plate"),
    parts.find(p => p.name === "Glass Surface"),
    parts.find(p => p.name === "Bed Carriage"),
    parts.find(p => p.name === "Leveling Springs"),
  ]},
  { name: "XY Gantry + Head", group: [
    parts.find(p => p.name === "Y Rails"),
    parts.find(p => p.name === "Y Carriages"),
    parts.find(p => p.name === "X Rail"),
    parts.find(p => p.name === "X Beam"),
    parts.find(p => p.name === "XY Belts"),
    parts.find(p => p.name === "XY Motors"),
    parts.find(p => p.name === "XY Idlers"),
    parts.find(p => p.name === "Nozzle"),
    parts.find(p => p.name === "Heater Block"),
    parts.find(p => p.name === "Heatbreak"),
    parts.find(p => p.name === "Heatsink"),
    parts.find(p => p.name === "Extruder Carriage"),
    parts.find(p => p.name === "Part Fan"),
    parts.find(p => p.name === "Extruder Motor"),
  ]},
  { name: "Spool + Filament", group: [
    parts.find(p => p.name === "Spool Rod"),
    parts.find(p => p.name === "Spool Shell"),
    parts.find(p => p.name === "Filament Roll"),
    parts.find(p => p.name === "Spool Hub"),
    parts.find(p => p.name === "Filament Guide Tube"),
  ]},
  parts.find(p => p.name === "Build Volume"),
];

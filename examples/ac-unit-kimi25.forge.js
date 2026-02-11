// Home AC Unit — Indoor + Outdoor units on opposite sides of a wall
// Parametric split-system air conditioner model

// === Wall Parameters ===
const wallThick = param("Wall Thickness", 200, { min: 100, max: 400, unit: "mm" });
const wallW = param("Wall Width", 400, { min: 300, max: 600, unit: "mm" });
const wallH = param("Wall Height", 300, { min: 200, max: 500, unit: "mm" });
const pipeOffsetY = param("Pipe Height", 150, { min: 50, max: 250, unit: "mm" });

// === Indoor Unit Parameters ===
const indoorW = param("Indoor Width", 800, { min: 600, max: 1000, unit: "mm" });
const indoorH = param("Indoor Height", 280, { min: 200, max: 400, unit: "mm" });
const indoorD = param("Indoor Depth", 200, { min: 150, max: 300, unit: "mm" });
const indoorY = param("Indoor Y Offset", 50, { min: 0, max: 150, unit: "mm" });
const indoorZ = param("Indoor Height Mount", 1800, { min: 1500, max: 2200, unit: "mm" });

// === Outdoor Unit Parameters ===
const outdoorW = param("Outdoor Width", 800, { min: 600, max: 1000, unit: "mm" });
const outdoorH = param("Outdoor Height", 550, { min: 400, max: 700, unit: "mm" });
const outdoorD = param("Outdoor Depth", 300, { min: 250, max: 400, unit: "mm" });
const outdoorGap = param("Outdoor Gap", 300, { min: 200, max: 500, unit: "mm" });

// === Pipe Parameters ===
const pipeDia = param("Pipe Diameter", 16, { min: 12, max: 22, unit: "mm" });
const pipeSpacing = param("Pipe Spacing", 40, { min: 30, max: 60, unit: "mm" });

// === Colors ===
const COLOR_INDOOR = "#F5F5F5";
const COLOR_INDOOR_VENT = "#E8E8E8";
const COLOR_OUTDOOR = "#E8F4E8";
const COLOR_GRILLE = "#2A2A2A";
const COLOR_FAN = "#1A1A1A";
const COLOR_PIPE_COPPER = "#B87333";
const COLOR_PIPE_INSULATION = "#4A4A4A";
const COLOR_WALL = "#D4C4B0";
const COLOR_DISPLAY = "#1A1A2E";

// === Wall with pipe holes ===
const wallBase = box(wallW, wallThick, wallH, true)
  .translate(0, 0, wallH / 2);

// Pipe holes through wall
const pipeHole1 = cylinder(wallThick + 10, pipeDia / 2, undefined, 16, true)
  .rotate(90, 0, 0)
  .translate(0, 0, pipeOffsetY);
const pipeHole2 = cylinder(wallThick + 10, pipeDia / 2, undefined, 16, true)
  .rotate(90, 0, 0)
  .translate(0, 0, pipeOffsetY + pipeSpacing);

const wall = wallBase.subtract(pipeHole1).subtract(pipeHole2).color(COLOR_WALL);

// === Indoor Unit ===
// Main body
let indoorBody = box(indoorW, indoorD, indoorH, true)
  .translate(-indoorW / 2 - wallW / 2 - 50, indoorY, indoorZ);

// Front panel with slight recess
const frontPanel = box(indoorW - 20, 10, indoorH - 20, true)
  .translate(-indoorW / 2 - wallW / 2 - 50 - indoorD / 2 - 5, indoorY, indoorZ)
  .color(COLOR_INDOOR);

// Air vent (bottom front)
const ventH = 60;
const ventDepth = 15;
const vent = box(indoorW - 40, ventDepth, ventH, true)
  .translate(-indoorW / 2 - wallW / 2 - 50 - indoorD / 2 + ventDepth / 2, indoorY, indoorZ - indoorH / 2 + ventH / 2 + 20)
  .color(COLOR_INDOOR_VENT);

// Vent slits pattern
const slitW = 4;
const slitGap = 8;
const numSlits = Math.floor((indoorW - 60) / (slitW + slitGap));
const slits = [];
for (let i = 0; i < numSlits; i++) {
  const x = -wallW / 2 - 50 - indoorD / 2 + ventDepth / 2 - indoorW / 2 + 30 + i * (slitW + slitGap) + slitW / 2;
  slits.push(
    box(slitW, ventDepth + 2, ventH - 10, true)
      .translate(x - indoorW / 2 - wallW / 2 - 50 + wallW / 2 + 50 + indoorW / 2, indoorY, indoorZ - indoorH / 2 + ventH / 2 + 20)
  );
}
let indoorWithVents = indoorBody;
if (slits.length > 0) {
  indoorWithVents = indoorBody.subtract(union(...slits));
}
indoorWithVents = indoorWithVents.color(COLOR_INDOOR);

// LED display panel (small rectangle on front)
const displayW = 80;
const displayH = 30;
const display = box(displayW, 5, displayH, true)
  .translate(-indoorW / 2 - wallW / 2 - 50 - indoorD / 2 - 2, indoorY - 50, indoorZ + indoorH / 2 - 50)
  .color(COLOR_DISPLAY);

// Mounting bracket (wall plate)
const bracketW = indoorW - 40;
const bracketH = 20;
const bracketD = 30;
const bracket = box(bracketW, bracketD, bracketH, true)
  .translate(-indoorW / 2 - wallW / 2 - 50, indoorY - indoorD / 2 - bracketD / 2, indoorZ)
  .color("#888888");

// === Outdoor Unit ===
// Main body
const outdoorX = wallW / 2 + outdoorGap + outdoorW / 2;
let outdoorBody = box(outdoorW, outdoorD, outdoorH, true)
  .translate(outdoorX, 0, outdoorH / 2);

// Fan grille (top circular pattern)
const fanDia = Math.min(outdoorW, outdoorD) * 0.7;
const fanGrille = cylinder(10, fanDia / 2, undefined, 32, true)
  .translate(outdoorX, 0, outdoorH - 5);

// Grille mesh pattern (concentric rings)
const rings = [];
const ringCount = 4;
for (let i = 1; i <= ringCount; i++) {
  const r = (fanDia / 2) * i / (ringCount + 1);
  rings.push(
    cylinder(8, r, undefined, 32, true).translate(outdoorX, 0, outdoorH - 5)
  );
}

// Cross bars on grille
const barW = 8;
const bar1 = box(fanDia, barW, 8, true).translate(outdoorX, 0, outdoorH - 5);
const bar2 = box(barW, fanDia, 8, true).translate(outdoorX, 0, outdoorH - 5);

let outdoorWithGrille = outdoorBody.subtract(fanGrille);
if (rings.length > 0) {
  outdoorWithGrille = outdoorWithGrille.subtract(union(...rings));
}
outdoorWithGrille = outdoorWithGrille.subtract(bar1).subtract(bar2).color(COLOR_OUTDOOR);

// Fan blades underneath (visible through grille)
const fanBlade = cylinder(5, fanDia * 0.45, undefined, 5, true)
  .translate(outdoorX, 0, outdoorH - 15)
  .color(COLOR_FAN);

// Side grilles (coil fins pattern on sides)
const finRows = 8;
const finCols = 6;
const finW = outdoorD * 0.6 / finCols;
const finH = outdoorH * 0.7 / finRows;
const sideGrilleHoles = [];
for (let r = 0; r < finRows; r++) {
  for (let c = 0; c < finCols; c++) {
    const z = 40 + r * (finH + 5);
    const y = -outdoorD * 0.3 + c * (finW + 8) + finW / 2;
    sideGrilleHoles.push(
      box(10, finW, finH, true).translate(outdoorX - outdoorW / 2 - 2, y, z)
    );
  }
}
if (sideGrilleHoles.length > 0) {
  outdoorWithGrille = outdoorWithGrille.subtract(union(...sideGrilleHoles));
}

// === Refrigerant Pipes ===
// Two pipes: one larger (suction), one smaller (liquid)
const pipeLength = outdoorGap + 100;

// Large pipe (suction line, insulated)
const pipeLarge = cylinder(pipeLength, pipeDia / 2 + 6, undefined, 16, true)
  .rotate(90, 0, 0)
  .translate(0, outdoorGap / 2, pipeOffsetY)
  .color(COLOR_PIPE_INSULATION);

// Small pipe (liquid line, bare copper)
const pipeSmall = cylinder(pipeLength, pipeDia / 2, undefined, 16, true)
  .rotate(90, 0, 0)
  .translate(0, outdoorGap / 2, pipeOffsetY + pipeSpacing)
  .color(COLOR_PIPE_COPPER);

// Pipe connections at indoor unit
const indoorPipeConn1 = cylinder(50, pipeDia / 2 + 6, undefined, 16, true)
  .rotate(0, 90, 0)
  .translate(-wallW / 2 - 25, indoorY, pipeOffsetY)
  .color(COLOR_PIPE_INSULATION);

const indoorPipeConn2 = cylinder(50, pipeDia / 2, undefined, 16, true)
  .rotate(0, 90, 0)
  .translate(-wallW / 2 - 25, indoorY, pipeOffsetY + pipeSpacing)
  .color(COLOR_PIPE_COPPER);

// Pipe connections at outdoor unit  
const outdoorPipeConn1 = cylinder(80, pipeDia / 2 + 6, undefined, 16, true)
  .rotate(0, 90, 0)
  .translate(wallW / 2 + 40, 0, pipeOffsetY)
  .color(COLOR_PIPE_INSULATION);

const outdoorPipeConn2 = cylinder(80, pipeDia / 2, undefined, 16, true)
  .rotate(0, 90, 0)
  .translate(wallW / 2 + 40, 0, pipeOffsetY + pipeSpacing)
  .color(COLOR_PIPE_COPPER);

// === Assembly ===
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Body", shape: indoorWithVents },
  { name: "Indoor Front Panel", shape: frontPanel },
  { name: "Air Vent", shape: vent },
  { name: "Display", shape: display },
  { name: "Mounting Bracket", shape: bracket },
  { name: "Outdoor Body", shape: outdoorWithGrille },
  { name: "Fan Blades", shape: fanBlade },
  { name: "Suction Pipe (Insulated)", shape: pipeLarge },
  { name: "Liquid Pipe (Copper)", shape: pipeSmall },
  { name: "Indoor Pipe Conn 1", shape: indoorPipeConn1 },
  { name: "Indoor Pipe Conn 2", shape: indoorPipeConn2 },
  { name: "Outdoor Pipe Conn 1", shape: outdoorPipeConn1 },
  { name: "Outdoor Pipe Conn 2", shape: outdoorPipeConn2 },
];

// ============================================
// Home AC Unit v3 - Indoor and Outdoor Components
// Fixed: fan grille position, pipe length and placement
// ============================================

// Wall Parameters
const wallThickness = param("Wall Thickness", 20, { min: 10, max: 50, unit: "mm" });
const wallWidth = param("Wall Width", 400, { min: 200, max: 600, unit: "mm" });
const wallHeight = param("Wall Height", 300, { min: 200, max: 500, unit: "mm" });

// Indoor Unit Parameters
const indoorWidth = param("Indoor Width", 200, { min: 100, max: 400, unit: "mm" });
const indoorHeight = param("Indoor Height", 80, { min: 40, max: 150, unit: "mm" });
const indoorDepth = param("Indoor Depth", 25, { min: 15, max: 60, unit: "mm" });

// Outdoor Unit Parameters
const outdoorWidth = param("Outdoor Width", 180, { min: 100, max: 400, unit: "mm" });
const outdoorHeight = param("Outdoor Height", 150, { min: 80, max: 300, unit: "mm" });
const outdoorDepth = param("Outdoor Depth", 50, { min: 30, max: 100, unit: "mm" });

// Colors
const wallColor = '#D4C4A8';
const indoorColor = '#FFFFFF';
const indoorAccent = '#E8E8E8';
const outdoorColor = '#F5F5F5';
const outdoorGrill = '#404040';
const pipeColor = '#A0A0A0';

// ---- WALL (centered at origin) ----
const wall = box(wallWidth, wallThickness, wallHeight, true)
  .color(wallColor);

// ---- INDOOR UNIT ----
const indoorCenterY = -wallThickness/2 - indoorDepth/2 - 5;
const indoorCenterZ = wallHeight/2 - indoorHeight/2 - 20;

const indoorBody = box(indoorWidth, indoorDepth, indoorHeight, true)
  .translate(0, indoorCenterY, indoorCenterZ)
  .color(indoorColor);

const indoorBounds = indoorBody.boundingBox;

// Control panel
const controlWidth = 35;
const controlHeight = 18;
const controlDepth = 4;
const controlPanel = box(controlWidth, controlDepth, controlHeight)
  .translate(
    indoorBounds.max[0] - controlWidth - 15,
    indoorBounds.min[1] - controlDepth,
    indoorBounds.max[2] - controlHeight - 15
  )
  .color('#1A1A1A');

// LED indicator
const led = sphere(2.5)
  .translate(
    indoorBounds.max[0] - controlWidth/2 - 15,
    indoorBounds.min[1] - controlDepth - 3,
    indoorBounds.max[2] - 25
  )
  .color('#00FF00');

// Vent slats
const slatCount = 4;
const slatWidth = indoorWidth - 30;
const slatThickness = 3;
const slatDepth = 8;
const slats = [];
for (let i = 0; i < slatCount; i++) {
  const slatZ = indoorBounds.min[2] + 10 + i * 12;
  const slat = box(slatWidth, slatDepth, slatThickness)
    .translate(-slatWidth/2, indoorBounds.min[1] - slatDepth, slatZ)
    .color(indoorAccent);
  slats.push(slat);
}

// ---- OUTDOOR UNIT ----
const outdoorCenterY = wallThickness/2 + outdoorDepth/2 + 10;
const outdoorCenterZ = outdoorHeight/2 + 30;

const outdoorBody = box(outdoorWidth, outdoorDepth, outdoorHeight, true)
  .translate(0, outdoorCenterY, outdoorCenterZ)
  .color(outdoorColor);

const outdoorBounds = outdoorBody.boundingBox;

// Fan grille - CENTERED vertically on the front face, not above the unit
const grilleRadius = outdoorWidth * 0.35;
const grilleCenterZ = (outdoorBounds.min[2] + outdoorBounds.max[2]) / 2; // exact center

const fanGrilleRim = cylinder(4, grilleRadius)
  .rotate(90, 0, 0)
  .translate(
    0,
    outdoorBounds.max[1] + 2, // on front face
    grilleCenterZ             // centered vertically
  )
  .color(outdoorGrill);

const fanGrilleCenter = cylinder(2, grilleRadius * 0.4)
  .rotate(90, 0, 0)
  .translate(0, outdoorBounds.max[1] + 3, grilleCenterZ)
  .color('#505050');

// Cooling fins - on sides
const finCount = 8;
const finWidth = 5;
const finDepth = 12;
const finHeight = 3;
const fins = [];

for (let i = 0; i < finCount; i++) {
  const finZ = outdoorBounds.min[2] + 20 + i * ((outdoorHeight - 40) / finCount);
  
  const leftFin = box(finWidth, finDepth, finHeight)
    .translate(outdoorBounds.min[0] - finWidth, outdoorBounds.min[1] + 5, finZ)
    .color(outdoorGrill);
  fins.push(leftFin);
  
  const rightFin = box(finWidth, finDepth, finHeight)
    .translate(outdoorBounds.max[0], outdoorBounds.min[1] + 5, finZ)
    .color(outdoorGrill);
  fins.push(rightFin);
}

// ---- REFRIGERANT PIPES ----
// Pipes go from back of indoor unit (near wall), through wall, to side of outdoor unit
const pipeRadius = 5;
const pipeX = 50;

// Pipe Z: at the bottom of indoor unit where connections typically are
const pipeZ = indoorBounds.min[2] + 20;

// Pipe endpoints in Y:
// - Indoor side: back of indoor unit (the part nearest the wall)
// - Outdoor side: back of outdoor unit (the part nearest the wall)
const pipeY_start = indoorBounds.max[1]; // back of indoor (near wall, +Y side)
const pipeY_end = outdoorBounds.min[1];  // back of outdoor (near wall, -Y side)

// Cylinder height (length along Y after rotation)
const pipeLength = pipeY_end - pipeY_start;

// Pipe center Y position
const pipeCenterY = (pipeY_start + pipeY_end) / 2;

// Liquid line (smaller)
const liquidPipe = cylinder(pipeLength, pipeRadius * 0.7)
  .rotate(90, 0, 0) // height now along Y
  .translate(pipeX, pipeCenterY, pipeZ)
  .color(pipeColor);

// Gas line (larger)
const gasPipe = cylinder(pipeLength, pipeRadius)
  .rotate(90, 0, 0)
  .translate(pipeX + 15, pipeCenterY, pipeZ)
  .color(pipeColor);

// Insulation at outdoor connection point
const insulationLiquid = cylinder(12, pipeRadius * 1.8)
  .rotate(90, 0, 0)
  .translate(pipeX, pipeY_end - 6, pipeZ)
  .color('#333333');

const insulationGas = cylinder(12, pipeRadius * 2.2)
  .rotate(90, 0, 0)
  .translate(pipeX + 15, pipeY_end - 6, pipeZ)
  .color('#333333');

// ---- RETURN ----
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Unit", shape: indoorBody },
  { name: "Control Panel", shape: controlPanel },
  { name: "LED", shape: led },
  { name: "Vent Slats", shape: union(...slats) },
  { name: "Outdoor Unit", shape: outdoorBody },
  { name: "Fan Grille", shape: union(fanGrilleRim, fanGrilleCenter) },
  { name: "Cooling Fins", shape: union(...fins) },
  { name: "Liquid Pipe", shape: liquidPipe },
  { name: "Gas Pipe", shape: gasPipe },
  { name: "Pipe Insulation", shape: union(insulationLiquid, insulationGas) },
];
// Home AC Unit — Indoor and Outdoor on opposite sides of a wall
// Strategy: build each part at origin, then attachTo() its parent.

// === Parameters ===
const wallW = param("Wall Width", 400, { min: 200, max: 600, unit: "mm" });
const wallH = param("Wall Height", 300, { min: 200, max: 500, unit: "mm" });
const wallT = param("Wall Thickness", 20, { min: 10, max: 50, unit: "mm" });

const inW = param("Indoor Width", 200, { min: 100, max: 400, unit: "mm" });
const inH = param("Indoor Height", 80, { min: 40, max: 150, unit: "mm" });
const inD = param("Indoor Depth", 25, { min: 15, max: 60, unit: "mm" });

const outW = param("Outdoor Width", 180, { min: 100, max: 400, unit: "mm" });
const outH = param("Outdoor Height", 150, { min: 80, max: 300, unit: "mm" });
const outD = param("Outdoor Depth", 50, { min: 30, max: 100, unit: "mm" });

// === Colors ===
const C_WALL = '#D4C4A8';
const C_INDOOR = '#FFFFFF';
const C_ACCENT = '#E8E8E8';
const C_OUTDOOR = '#F5F5F5';
const C_GRILL = '#404040';
const C_PIPE = '#A0A0A0';

// === Wall (centered at origin) ===
const wall = box(wallW, wallT, wallH, true).color(C_WALL);

// === Indoor Unit ===
// Sits on the front face of the wall (-Y side), near the ceiling.
// Build at origin, then attach: indoor's back face → wall's front face, then offset up and out.
const indoorBody = box(inW, inD, inH, true).color(C_INDOOR)
  .attachTo(wall, 'top-front', 'top-back', [0, -5, -20]);
  // back of indoor touches front of wall, shifted 5mm away from wall, 20mm below ceiling

// Vent slats — protrude from the FRONT face of the indoor unit
const slatCount = 4;
const slats = [];
for (let i = 0; i < slatCount; i++) {
  const slat = box(inW - 30, 8, 3, true).color(C_ACCENT)
    .attachTo(indoorBody, 'bottom-front', 'bottom-back', [0, -1, 8 + i * 12]);
    // back of slat on front of indoor, 1mm gap, stacked upward from bottom
  slats.push(slat);
}

// Control panel — sticks out from front-right area
const panel = box(35, 4, 18, true).color('#1A1A1A')
  .attachTo(indoorBody, 'top-front-right', 'top-back-right', [5, -1, -15]);

// LED
const led = sphere(2.5).color('#00FF00')
  .attachTo(panel, 'front', 'center', [5, -2, -5]);

// === Outdoor Unit ===
// Sits on the back face of the wall (+Y side), near the ground.
const outdoorBody = box(outW, outD, outH, true).color(C_OUTDOOR)
  .attachTo(wall, 'bottom-back', 'bottom-front', [0, 10, 30]);
  // front of outdoor touches back of wall, 10mm standoff, 30mm above ground

// Fan grille — on the back face (+Y) of outdoor unit, centered
const grilleR = Math.min(outW, outH) * 0.35;
const fanRim = cylinder(4, grilleR).color(C_GRILL)
  .pointAlong([0, 1, 0]) // lay along +Y
  .attachTo(outdoorBody, 'back', 'front', [0, 2, 0]);

const fanCenter = cylinder(2, grilleR * 0.4).color('#505050')
  .pointAlong([0, 1, 0])
  .attachTo(outdoorBody, 'back', 'front', [0, 3, 0]);

// Cooling fins — protrude from left and right sides
const finCount = 8;
const fins = [];
const outdoorBB = outdoorBody.boundingBox();
const finSpacing = (outH - 40) / finCount;
for (let i = 0; i < finCount; i++) {
  const zOff = -outH / 2 + 20 + i * finSpacing;
  // Left fin: right face of fin on left face of outdoor
  const leftFin = box(5, 12, 3, true).color(C_GRILL)
    .attachTo(outdoorBody, 'left', 'right', [0, -10, zOff]);
  // Right fin: left face of fin on right face of outdoor
  const rightFin = box(5, 12, 3, true).color(C_GRILL)
    .attachTo(outdoorBody, 'right', 'left', [0, -10, zOff]);
  fins.push(leftFin, rightFin);
}

// === Refrigerant Pipes ===
// Connect from back of indoor unit through wall to front of outdoor unit.
// Pipe runs along Y axis.
const indoorBB = indoorBody.boundingBox();
const pipeStartY = indoorBB.max[1]; // back of indoor (wall side)
const pipeEndY = outdoorBB.min[1];  // front of outdoor (wall side)
const pipeLen = pipeEndY - pipeStartY;
const pipeCenterY = (pipeStartY + pipeEndY) / 2;
const pipeZ = indoorBB.min[2] + 15; // near bottom of indoor unit
const pipeX = 40;

const liquidPipe = cylinder(pipeLen, 3.5).color(C_PIPE)
  .pointAlong([0, 1, 0])
  .translate(pipeX, pipeCenterY, pipeZ);

const gasPipe = cylinder(pipeLen, 5).color(C_PIPE)
  .pointAlong([0, 1, 0])
  .translate(pipeX + 15, pipeCenterY, pipeZ);

// Insulation at outdoor connection
const insLiquid = cylinder(12, 7).color('#333333')
  .pointAlong([0, 1, 0])
  .translate(pipeX, pipeEndY - 6, pipeZ);

const insGas = cylinder(12, 10).color('#333333')
  .pointAlong([0, 1, 0])
  .translate(pipeX + 15, pipeEndY - 6, pipeZ);

// === Return ===
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Unit", shape: indoorBody },
  { name: "Vent Slats", shape: union(...slats) },
  { name: "Control Panel", shape: panel },
  { name: "LED", shape: led },
  { name: "Outdoor Unit", shape: outdoorBody },
  { name: "Fan Grille", shape: union(fanRim, fanCenter) },
  { name: "Cooling Fins", shape: union(...fins) },
  { name: "Liquid Pipe", shape: liquidPipe },
  { name: "Gas Pipe", shape: gasPipe },
  { name: "Pipe Insulation", shape: union(insLiquid, insGas) },
];

// Home AC Unit V3 - Fixed pipe connections to properly enter indoor unit
// Coordinate system: Z-up (X=left/right, Y=forward/back, Z=up/down)
// Front (-Y) = indoor side, Back (+Y) = outdoor side

// Parameters
const wallThick = param("Wall Thickness", 150, { min: 100, max: 300, unit: "mm" });
const indoorW = param("Indoor Width", 700, { min: 500, max: 1000, unit: "mm" });
const indoorH = param("Indoor Height", 250, { min: 180, max: 350, unit: "mm" });
const indoorD = param("Indoor Depth", 200, { min: 150, max: 300, unit: "mm" });
const outdoorW = param("Outdoor Width", 800, { min: 600, max: 1200, unit: "mm" });
const outdoorH = param("Outdoor Height", 550, { min: 400, max: 700, unit: "mm" });
const outdoorD = param("Outdoor Depth", 300, { min: 200, max: 400, unit: "mm" });
const mountHeight = param("Mount Height", 2000, { min: 1500, max: 2500, unit: "mm" });
const pipeSpacing = param("Pipe Spacing", 80, { min: 50, max: 150, unit: "mm" });

// --- Wall (vertical, separates indoor and outdoor) ---
const wallW = Math.max(indoorW, outdoorW) + 200;
const wallH = 2500;
const wall = box(wallW, wallThick, wallH, true)
  .translate(0, 0, wallH / 2)
  .color('#E8E4D9');

// --- Indoor Unit (on the -Y side of wall) ---
// Position: back face flush with wall front (Y = -wallThick/2), centered at mountHeight
const indoorUnitY = -wallThick/2 - indoorD/2;
const indoorUnitZ = mountHeight;

// Main body
const indoorBody = box(indoorW, indoorD, indoorH, true)
  .color('#F5F5F0')
  .translate(0, indoorUnitY, indoorUnitZ);

// Front panel with vent slats
const ventPanel = box(indoorW - 20, 5, indoorH * 0.6, true)
  .color('#E0E0E0')
  .translate(0, indoorUnitY - indoorD/2 - 2, indoorUnitZ - indoorH * 0.15);

// Top vent (air outlet)
const topVent = box(indoorW - 40, indoorD - 10, 15, true)
  .color('#D0D0D0')
  .translate(0, indoorUnitY, indoorUnitZ + indoorH/2 - 5);

// Display panel
const display = box(80, 3, 30, true)
  .color('#1a1a2e')
  .translate(indoorW * 0.3, indoorUnitY - indoorD/2 - 1, indoorUnitZ + indoorH * 0.25);

// LED indicator
const led = cylinder(2, 3, undefined, undefined, true)
  .color('#00ff00')
  .pointAlong([0, -1, 0])
  .translate(indoorW * 0.3, indoorUnitY - indoorD/2 - 3, indoorUnitZ + indoorH * 0.25);

// Indoor mounting brackets (L-brackets on wall)
const bracketThick = 10;
const bracketW = 60;
const bracketV = box(bracketThick, bracketW, 100, true).color('#606060');
const bracketH = box(60, bracketThick, bracketW, true).color('#606060')
  .translate(0, bracketW/2, -50 + bracketThick/2);

const indoorBracketL = union(bracketV, bracketH)
  .translate(-indoorW/2 + 80, -wallThick/2 - bracketThick/2, mountHeight - indoorH/2);

const indoorBracketR = union(bracketV, bracketH)
  .translate(indoorW/2 - 80, -wallThick/2 - bracketThick/2, mountHeight - indoorH/2);

// --- Outdoor Unit (on the +Y side of wall) ---
// Position: front face flush with wall back (Y = wallThick/2)
const outdoorUnitY = wallThick/2 + outdoorD/2;
const outdoorUnitZ = mountHeight - (outdoorH - indoorH)/2;

// Main body
const outdoorBody = box(outdoorW, outdoorD, outdoorH, true)
  .color('#FFFFFF')
  .translate(0, outdoorUnitY, outdoorUnitZ);

// Fan grill - vertical cylinder facing forward (along -Y)
const fanRadius = Math.min(outdoorW, outdoorH) * 0.35;
const fanGrill = cylinder(10, fanRadius, fanRadius, undefined, true)
  .color('#404040')
  .pointAlong([0, -1, 0])
  .translate(0, outdoorUnitY + outdoorD/2 + 5, outdoorUnitZ);

// Fan blades
const bladeCount = 5;
const fanBlades = [];
for (let i = 0; i < bladeCount; i++) {
  const angle = (i / bladeCount) * 360;
  const blade = box(fanRadius * 0.7, 5, 30, true)
    .color('#333333')
    .rotate(angle, 0, 0)
    .translate(0, outdoorUnitY + outdoorD/2 + 5, outdoorUnitZ);
  fanBlades.push(blade);
}

// Side vents
const sideVents = [];
for (let i = 0; i < 6; i++) {
  const y = (i - 2.5) * (outdoorH * 0.6 / 5);
  const sv = box(5, outdoorD - 20, 12, true)
    .color('#C0C0C0')
    .translate(outdoorW/2 + 2, outdoorUnitY, outdoorUnitZ + y);
  sideVents.push(sv);
}

// Outdoor mounting feet
const footW = 100;
const footD = 15;
const footH = 40;

const leftFoot = box(footD, outdoorD - 20, footH, true)
  .color('#505050')
  .translate(-outdoorW/2 + 100, outdoorUnitY, outdoorUnitZ - outdoorH/2 - footH/2);

const rightFoot = box(footD, outdoorD - 20, footH, true)
  .color('#505050')
  .translate(outdoorW/2 - 100, outdoorUnitY, outdoorUnitZ - outdoorH/2 - footH/2);

// Wall mounting plate for outdoor unit
const mountPlate = box(200, 10, 200, true)
  .color('#505050')
  .translate(0, wallThick/2 + 5, outdoorUnitZ);

// --- Connecting Pipes ---
// Two refrigerant lines going from outdoor unit, through wall, into indoor unit
const pipeR = 12;

// Pipe Z position - aligned with bottom portion of indoor unit
const pipeZ = mountHeight - indoorH/2 + 50;

// Calculate Y positions for pipe segments
// Indoor unit back face is at Y = indoorUnitY + indoorD/2 = -75 + 100 = 25? No...
// indoorUnitY = -75 - 100 = -175
// Indoor extends from Y=-275 (front) to Y=-75 (back, against wall)
// Wall is at Y=-75 to Y=+75
// Outdoor extends from Y=+75 (front, facing wall) to Y=+375 (back)

// Pipe 1 - the larger insulated line
// Outdoor segment: from outdoor front (Y=75) extending backward into unit
const pipe1Outdoor = cylinder(200, pipeR + 6, undefined, undefined, true)
  .pointAlong([0, -1, 0])  // Points toward -Y (toward wall)
  .color('#8B4513')  // Copper
  .translate(-pipeSpacing/2, outdoorUnitY - outdoorD/2 - 50, pipeZ);

// Wall segment: through the wall thickness
const pipe1Wall = cylinder(wallThick + 20, pipeR + 8, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')  // Blue insulation
  .translate(-pipeSpacing/2, 0, pipeZ);

// Indoor segment: from wall (Y=-75) extending into indoor unit (to Y=-175 center)
const pipe1Indoor = cylinder(120, pipeR + 8, undefined, undefined, true)
  .pointAlong([0, -1, 0])  // Points toward -Y (into indoor unit)
  .color('#1a5f7a')
  .translate(-pipeSpacing/2, indoorUnitY + indoorD/2 - 60, pipeZ);

// Pipe 2 - smaller line
const pipe2Outdoor = cylinder(200, pipeR, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#8B4513')
  .translate(pipeSpacing/2, outdoorUnitY - outdoorD/2 - 50, pipeZ);

const pipe2Wall = cylinder(wallThick + 20, pipeR, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, 0, pipeZ);

const pipe2Indoor = cylinder(120, pipeR, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, indoorUnitY + indoorD/2 - 60, pipeZ);

// Wall sleeves
const sleeve1 = cylinder(wallThick + 10, pipeR + 15, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#888888')
  .translate(-pipeSpacing/2, 0, pipeZ);

const sleeve2 = cylinder(wallThick + 10, pipeR + 10, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#888888')
  .translate(pipeSpacing/2, 0, pipeZ);

// Connection points (visual only - where pipes enter the units)
const conn1Indoor = cylinder(20, pipeR + 10, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#606060')
  .translate(-pipeSpacing/2, indoorUnitY + indoorD/2, pipeZ);

const conn1Outdoor = cylinder(20, pipeR + 8, undefined, undefined, true)
  .pointAlong([0, 1, 0])
  .color('#606060')
  .translate(-pipeSpacing/2, outdoorUnitY - outdoorD/2, pipeZ);

const conn2Indoor = cylinder(20, pipeR + 4, undefined, undefined, true)
  .pointAlong([0, -1, 0])
  .color('#606060')
  .translate(pipeSpacing/2, indoorUnitY + indoorD/2, pipeZ);

const conn2Outdoor = cylinder(20, pipeR + 2, undefined, undefined, true)
  .pointAlong([0, 1, 0])
  .color('#606060')
  .translate(pipeSpacing/2, outdoorUnitY - outdoorD/2, pipeZ);

return [
  { name: "Wall", shape: wall },
  { name: "Indoor Brackets", group: [
    { name: "Left Bracket", shape: indoorBracketL },
    { name: "Right Bracket", shape: indoorBracketR }
  ] },
  { name: "Indoor Unit Body", shape: indoorBody },
  { name: "Indoor Vent", shape: ventPanel },
  { name: "Indoor Top Vent", shape: topVent },
  { name: "Display Panel", shape: display },
  { name: "Power LED", shape: led },
  { name: "Outdoor Mount Plate", shape: mountPlate },
  { name: "Outdoor Unit Body", shape: outdoorBody },
  { name: "Fan Grill", shape: fanGrill },
  { name: "Fan Blades", group: fanBlades.map((b, i) => ({ name: `Blade ${i + 1}`, shape: b })) },
  { name: "Side Vents", group: sideVents.map((v, i) => ({ name: `Vent ${i + 1}`, shape: v })) },
  { name: "Outdoor Feet", group: [
    { name: "Left Foot", shape: leftFoot },
    { name: "Right Foot", shape: rightFoot }
  ] },
  { name: "Pipe 1 (Outdoor)", shape: pipe1Outdoor },
  { name: "Pipe 1 (Wall)", shape: pipe1Wall },
  { name: "Pipe 1 (Indoor)", shape: pipe1Indoor },
  { name: "Pipe 2 (Outdoor)", shape: pipe2Outdoor },
  { name: "Pipe 2 (Wall)", shape: pipe2Wall },
  { name: "Pipe 2 (Indoor)", shape: pipe2Indoor },
  { name: "Wall Sleeves", shape: union(sleeve1, sleeve2) },
  { name: "Conn Indoor 1", shape: conn1Indoor },
  { name: "Conn Outdoor 1", shape: conn1Outdoor },
  { name: "Conn Indoor 2", shape: conn2Indoor },
  { name: "Conn Outdoor 2", shape: conn2Outdoor },
];

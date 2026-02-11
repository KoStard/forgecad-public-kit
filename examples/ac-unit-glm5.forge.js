// Home AC Unit V3 - Fixed cylinder orientation and positioning

// Parameters
const wallThick = param("Wall Thickness", 20, { min: 10, max: 40, unit: "mm" });
const indoorWidth = param("Indoor Width", 80, { min: 60, max: 120, unit: "mm" });
const indoorHeight = param("Indoor Height", 30, { min: 20, max: 50, unit: "mm" });
const indoorDepth = param("Indoor Depth", 20, { min: 15, max: 35, unit: "mm" });
const outdoorWidth = param("Outdoor Width", 70, { min: 50, max: 100, unit: "mm" });
const outdoorHeight = param("Outdoor Height", 55, { min: 40, max: 80, unit: "mm" });
const outdoorDepth = param("Outdoor Depth", 30, { min: 20, max: 50, unit: "mm" });

// --- Wall (reference) ---
// Centered on Y=0: front at Y=-wallThick/2, back at Y=+wallThick/2
const wall = box(120, wallThick, 100, true).color('#d4c4a8');

// --- INDOOR UNIT (on FRONT of wall, -Y side) ---
const indoorBody = box(indoorWidth, indoorDepth, indoorHeight, true)
  .color('#f5f5f5')
  .attachTo(wall, 'front', 'back', [0, 0, 20]); // Raised 20mm above center

// Front panel (flush with indoor body front)
const frontPanel = roundedRect(indoorWidth - 4, indoorHeight - 4, 3, true)
  .extrude(2)
  .color('#ffffff')
  .attachTo(indoorBody, 'front', 'back');

// Air outlet vents
const ventCount = 5;
const ventSpacing = indoorHeight / (ventCount + 1);
const vents = [];
for (let i = 1; i <= ventCount; i++) {
  const z = -indoorHeight/2 + i * ventSpacing;
  const vent = box(indoorWidth - 20, 2, 3, true)
    .color('#333333')
    .attachTo(frontPanel, 'front', 'center', [0, -1, z]);
  vents.push(vent);
}

// Display panel
const display = box(15, 1, 6, true)
  .color('#1a1a2e')
  .attachTo(frontPanel, 'front', 'center', [indoorWidth/4, -1, indoorHeight/4]);

// LED indicator
const led = sphere(1.5).color('#00ff00')
  .attachTo(display, 'front', 'front', [0, -1, -2]);

// Mounting bracket
const bracket = box(indoorWidth - 10, 3, 5)
  .color('#888888')
  .attachTo(indoorBody, 'back', 'front');

// --- OUTDOOR UNIT (on BACK of wall, +Y side) ---
const outdoorBody = box(outdoorWidth, outdoorDepth, outdoorHeight, true)
  .color('#e8e8e8')
  .attachTo(wall, 'back', 'front', [0, 0, 10]); // Raised slightly

// Big fan housing - CYLINDER MUST BE ORIENTED ALONG Y FIRST!
const fanRadius = outdoorHeight * 0.35;
const fanDepth = outdoorDepth - 8;
const fanHousing = cylinder(fanDepth, fanRadius)
  .pointAlong([0, 1, 0])  // Orient along Y axis (perpendicular to wall)
  .color('#555555')
  .attachTo(outdoorBody, 'front', 'back'); // Cylinder's back face at outdoor body's front

// Fan blades
const fanBlade = cylinder(3, fanRadius - 3)
  .pointAlong([0, 1, 0])
  .color('#222222')
  .attachTo(fanHousing, 'front', 'front');

// Fan grille (concentric rings)
const grilleInner = circle2d(fanRadius * 0.4).color('#666666');
const grilleMiddle = circle2d(fanRadius * 0.7)
  .subtract(circle2d(fanRadius * 0.6))
  .color('#666666');
const grilleOuter = circle2d(fanRadius * 0.9)
  .subtract(circle2d(fanRadius * 0.85))
  .color('#666666');
const grille = union2d(grilleInner, grilleMiddle, grilleOuter)
  .extrude(0.5)
  .attachTo(fanBlade, 'front', 'front');

// Heat exchanger fins (on side, vertical)
const finCount = 8;
const fins = [];
for (let i = 0; i < finCount; i++) {
  const fin = box(0.5, outdoorDepth - 8, outdoorHeight - 10, true)
    .color('#cc8844')
    .attachTo(outdoorBody, 'right', 'center', [outdoorWidth/2 - 3 + i * 3, 0, 0]);
  fins.push(fin);
}

// Outdoor unit legs
const legH = 8;
const leg1 = box(8, 8, legH).color('#444444')
  .attachTo(outdoorBody, 'bottom', 'top', [outdoorWidth/3, outdoorDepth/3, -legH/2]);
const leg2 = box(8, 8, legH).color('#444444')
  .attachTo(outdoorBody, 'bottom', 'top', [-outdoorWidth/3, outdoorDepth/3, -legH/2]);

// --- CONNECTING PIPES ---
const pipeR = 4;

// Get bounding boxes for precise pipe routing
const indoorBB = indoorBody.boundingBox();
const outdoorBB = outdoorBody.boundingBox();

// Pipe exit point: bottom-back of indoor unit
const exitX = -indoorWidth/3;
const exitY = indoorBB.min[1]; // Back of indoor unit (most negative Y)
const exitZ = indoorBB.min[2] + 8; // Near bottom

// Pipe entry point: bottom-front of outdoor unit  
const entryX = outdoorWidth/3;
const entryY = outdoorBB.max[1]; // Front of outdoor unit (most positive Y)
const entryZ = outdoorBB.min[2] + 12;

// Segment 1: Drop down from indoor unit
const dropH = 20;
const pipe1 = cylinder(dropH, pipeR)
  .pointAlong([0, 0, -1])  // Pointing down
  .translate(exitX, exitY + 2, exitZ)
  .color('#c4a066');

// Segment 2: Horizontal through wall
const midZ = exitZ - dropH;
const pipe2Len = entryY - exitY + 4; // From indoor exit to outdoor entry
const pipe2 = cylinder(pipe2Len, pipeR)
  .pointAlong([0, 1, 0])  // Pointing toward outdoor (positive Y)
  .translate(exitX, exitY + pipe2Len/2, midZ)
  .color('#c4a066');

// Segment 3: Rise up to outdoor unit
const riseH = entryZ - midZ;
const pipe3 = cylinder(riseH, pipeR)
  .pointAlong([0, 0, 1])  // Pointing up
  .translate(entryX, entryY - 2, midZ)
  .color('#c4a066');

// Segment 4: Connect into outdoor unit
const pipe4 = cylinder(12, pipeR)
  .pointAlong([0, -1, 0])  // Pointing toward outdoor unit
  .translate(entryX, entryY + 6, entryZ)
  .color('#c4a066');

// --- Return as named objects ---
return [
  { name: "Wall", shape: wall },
  
  // Indoor unit
  { name: "Indoor Body", shape: indoorBody },
  { name: "Front Panel", shape: frontPanel },
  { name: "Vents", shape: group(...vents) },
  { name: "Display", shape: display },
  { name: "LED", shape: led },
  { name: "Mounting Bracket", shape: bracket },
  
  // Outdoor unit  
  { name: "Outdoor Body", shape: outdoorBody },
  { name: "Fan Housing", shape: fanHousing },
  { name: "Fan Blades", shape: fanBlade },
  { name: "Fan Grille", shape: grille },
  { name: "Heat Fins", shape: group(...fins) },
  { name: "Legs", shape: group(leg1, leg2) },
  
  // Pipes
  { name: "Pipe 1 (drop)", shape: pipe1 },
  { name: "Pipe 2 (horizontal)", shape: pipe2 },
  { name: "Pipe 3 (rise)", shape: pipe3 },
  { name: "Pipe 4 (connect)", shape: pipe4 },
];
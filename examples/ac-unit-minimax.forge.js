// Home AC Unit V3 - Fixed positioning
// Indoor unit on front of wall, outdoor unit on back, connected through wall

// Parameters
const wallThick = param("Wall Thickness", 15, { min: 10, max: 30, unit: "mm" });
const wallWidth = param("Wall Width", 200, { min: 150, max: 300, unit: "mm" });
const wallHeight = param("Wall Height", 150, { min: 100, max: 250, unit: "mm" });

// Indoor unit parameters
const indoorW = param("Indoor Width", 70, { min: 50, max: 100, unit: "mm" });
const indoorD = param("Indoor Depth", 20, { min: 15, max: 35, unit: "mm" });
const indoorH = param("Indoor Height", 28, { min: 20, max: 45, unit: "mm" });

// Outdoor unit parameters
const outdoorW = param("Outdoor Width", 75, { min: 55, max: 110, unit: "mm" });
const outdoorD = param("Outdoor Depth", 30, { min: 20, max: 50, unit: "mm" });
const outdoorH = param("Outdoor Height", 55, { min: 35, max: 85, unit: "mm" });
const fanR = param("Fan Radius", 20, { min: 12, max: 30, unit: "mm" });

// Pipe parameters
const pipeR = param("Pipe Radius", 4, { min: 2, max: 8, unit: "mm" });

// === Build the wall (NOT centered - easier to position against) ===
const wall = box(wallWidth, wallThick, wallHeight).color('#999999');

// === Indoor Unit (mounted on FRONT of wall) ===
// Main body
const indoorMain = box(indoorW, indoorD, indoorH).color('#e8e8e8');

// Vent grille at bottom
const vent = rect(indoorW - 8, 4).extrude(2).color('#555555')
  .translate(indoorW / 2, 0, -indoorH / 2 + 5);
const indoorWithVent = union(indoorMain, vent);

// Position: attach to front of wall, offset outward
const indoor = indoorWithVent.color('#f0f0f0')
  .attachTo(wall, 'front', 'back', [0, -2, 20]);

// Display panel - 2D rect extruded, oriented vertically
const display = rect(15, 8).extrude(1).color('#222222')
  .rotate(90, 0, 0)  // Rotate to stand upright
  .attachTo(indoor, 'front', 'back', [indoorW / 2 - 15, -1, indoorH / 2 - 8]);

// === Outdoor Unit (mounted on BACK of wall) ===
// Main body
const outdoorMain = box(outdoorW, outdoorD, outdoorH).color('#b8b8b8');

// Base/platform for outdoor unit
const outdoorBase = box(outdoorW + 8, outdoorD + 8, 6).color('#888888')
  .attachTo(outdoorMain, 'bottom', 'top', [0, 0, -3]);

const outdoorWithBase = union(outdoorMain, outdoorBase);

// Position: attach to back of wall, offset outward
const outdoor = outdoorWithBase.color('#cccccc')
  .attachTo(wall, 'back', 'front', [0, 2, 20]);

// === Fan Assembly (on front of outdoor unit, pointing outward) ===
// Fan grille - circle with hole, extruded
const grilleOuter = circle2d(fanR + 3).extrude(2).color('#666666');
const grilleInner = circle2d(fanR).extrude(3).color('#333333');
const grille = difference(grilleOuter, grilleInner);

// Rotate grille to be perpendicular to front face (facing outward along +Y)
const grilleRotated = grille.rotate(90, 0, 0)
  .attachTo(outdoor, 'front', 'back', [0, -1, 0]);

// Fan blades - radial pattern
const blade = box(3, fanR - 4, 2).translate(0, (fanR - 4) / 2 + 2, 0).color('#555555');
const fan = circularPattern(blade, 5).color('#666666')
  .rotate(90, 0, 0)  // Rotate to stand upright in grille
  .attachTo(outdoor, 'front', 'back', [0, -1, 0]);

// Fan hub - cylinder pointing outward
const hub = cylinder(8, fanR / 4).color('#444444')
  .rotate(90, 0, 0)  // Point along Y axis
  .attachTo(outdoor, 'front', 'center', [0, -1, 0]);

// === Connector Pipes (through the wall) ===
// Get positions from the attached shapes
const indoorBB = indoor.boundingBox();
const outdoorBB = outdoor.boundingBox();

// Pipe goes from indoor back to outdoor front through wall
// Wall is at Y=0 to Y=wallThick, so pipe should span from indoor back to outdoor front
const pipeStartY = indoorBB.max[1];  // Back of indoor
const pipeEndY = outdoorBB.min[1];   // Front of outdoor
const pipeLen = pipeEndY - pipeStartY;

// Vertical offset on the units
const pipeZ = 20;

// Main refrigerant pipe - goes through wall along Y axis
const mainPipe = cylinder(pipeLen, pipeR)
  .pointAlong([0, 1, 0])  // Along Y axis
  .translate(0, (pipeStartY + pipeEndY) / 2, pipeZ)
  .color('#aa6644');

// Second refrigerant line - offset to the right
const line2 = cylinder(pipeLen, pipeR * 0.7)
  .pointAlong([0, 1, 0])
  .translate(pipeR * 2 + 2, (pipeStartY + pipeEndY) / 2, pipeZ)
  .color('#aa6644');

// Condensate drain line - lower down
const drain = cylinder(pipeLen, pipeR * 0.6)
  .pointAlong([0, 1, 0])
  .translate(0, (pipeStartY + pipeEndY) / 2, pipeZ - pipeR * 2 - 2)
  .color('#44aa66');

// Return all objects as separate items to preserve colors
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Unit", shape: indoor },
  { name: "Display", shape: display },
  { name: "Outdoor Unit", shape: outdoor },
  { name: "Fan Grille", shape: grilleRotated },
  { name: "Fan Blades", shape: fan },
  { name: "Fan Hub", shape: hub },
  { name: "Main Pipe", shape: mainPipe },
  { name: "Refrigerant Line", shape: line2 },
  { name: "Drain Line", shape: drain },
];
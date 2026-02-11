---
hermes_append_context: /Users/kostard/Projects/CAD/ForgeCAD/docs/permanent, /Users/kostard/Projects/CAD/ForgeCAD/examples/api
---
# Goal

Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The internal part hanging from the wall. The external part as well hanging from the wall, has big fan. These parts are connected with a pipe.
Implement whatever features/methods you are missing in the script itself for your convenience.
Use the simpler primitives when unsure.
Put the script in a markdown block below.

# The script
```javascript
// Home AC Unit - Indoor and Outdoor parts connected by pipes
// Indoor unit hangs on one side of the wall, outdoor unit on the other with a big fan

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

// === Build the wall ===
const wall = box(wallWidth, wallThick, wallHeight).color('#999999');

// === Indoor Unit (inside, mounted on front of wall) ===
const indoorMain = box(indoorW, indoorD, indoorH).color('#e8e8e8');

// Vent grille at bottom of indoor unit
const vent = rect(indoorW - 8, 4).translate(indoorW / 2, 0, indoorH / 2 - 5)
  .extrude(2).color('#555555');
const indoor = union(indoorMain, vent).color('#f0f0f0')
  .attachTo(wall, 'front', 'front', [-indoorD / 2 - 2, 0, 20]);

// Display panel on indoor unit
const display = rect(15, 8, true).extrude(1).color('#222222')
  .attachTo(indoor, 'front', 'back', [indoorW / 2 - 15, -1, indoorH / 2 - 8]);

// === Outdoor Unit (outside, mounted on back of wall) ===
const outdoorMain = box(outdoorW, outdoorD, outdoorH).color('#b8b8b8');

// Base/platform for outdoor unit
const outdoorBase = box(outdoorW + 8, outdoorD + 8, 6).color('#888888')
  .attachTo(outdoorMain, 'bottom', 'top', [0, 0, -3]);

const outdoor = union(outdoorMain, outdoorBase).color('#cccccc')
  .attachTo(wall, 'back', 'back', [outdoorD / 2 + 2, 0, 20]);

// Fan grille (circular pattern) on front of outdoor unit
const grilleOuter = circle2d(fanR + 3).extrude(2).color('#666666');
const grilleInner = circle2d(fanR).extrude(3).color('#333333');
const grille = difference(grilleOuter, grilleInner)
  .attachTo(outdoor, 'front', 'front', [0, -1, 0]);

// Fan blades - radial pattern
const blade = box(3, fanR - 4, 2).translate(0, (fanR - 4) / 2 + 2, 0).color('#555555');
const fan = circularPattern(blade, 5).color('#666666')
  .attachTo(grille, 'center', 'center');

// Fan hub
const hub = cylinder(8, fanR / 4).color('#444444')
  .attachTo(grille, 'center', 'center');

// === Connector Pipes (through the wall) ===
const pipeLen = wallThick + 20;

// Main refrigerant pipe
const mainPipe = cylinder(pipeLen, pipeR).pointAlong([0, 1, 0]).color('#aa6644')
  .attachTo(indoor, 'back', 'front', [0, 0, 5]);

// Second refrigerant line
const line2 = cylinder(pipeLen, pipeR * 0.7).pointAlong([0, 1, 0]).color('#aa6644')
  .attachTo(mainPipe, 'right', 'left', [pipeR * 2 + 2, 0, 0]);

// Condensate drain line
const drain = cylinder(pipeLen, pipeR * 0.6).pointAlong([0, 1, 0]).color('#44aa66')
  .attachTo(mainPipe, 'bottom', 'top', [0, 0, -pipeR * 2 - 2]);

// === Position everything ===
const indoorPos = indoor.translate(0, -wallThick / 2 - indoorD / 2 - 5, 0);
const displayPos = display.translate(0, -wallThick / 2 - indoorD / 2 - 6, 0);
const outdoorPos = outdoor.translate(0, wallThick / 2 + outdoorD / 2 + 5, 0);

// Position pipes through the wall
const pipeY = 0;
const pipeStart = indoorPos.boundingBox().max[1] + 2;
const pipeEnd = outdoorPos.boundingBox().min[1] - 2;

const mainPipePos = mainPipe.translate(0, (pipeStart + pipeEnd) / 2 - pipeY, 20);
const line2Pos = line2.translate(0, (pipeStart + pipeEnd) / 2 - pipeY, 20);
const drainPos = drain.translate(0, (pipeStart + pipeEnd) / 2 - pipeY, 20);

// Return all objects as separate items to preserve colors
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Unit", shape: indoorPos },
  { name: "Display", shape: displayPos },
  { name: "Outdoor Unit", shape: outdoorPos },
  { name: "Fan Grille", shape: grille },
  { name: "Fan Blades", shape: fan },
  { name: "Fan Hub", shape: hub },
  { name: "Main Pipe", shape: mainPipePos },
  { name: "Refrigerant Line", shape: line2Pos },
  { name: "Drain Line", shape: drainPos },
];
```

# Feedback

Not bad start.
Many components have wrong location, wrong rotation, direction, etc.
But overall, there is a wall, the two boxes on both sides.
Figure out better concepts to use for better iteration.

```
npm run test-run examples/ac-unit-minimax.forge.js

> forgecad@0.1.0 test-run
> npx tsx cli/test-run.ts examples/ac-unit-minimax.forge.js

✓ Objects: 10
  Wall: vol=450000.0mm³  bbox=[0.0,0.0,0.0] → [200.0,15.0,150.0]
  Indoor Unit: vol=39416.0mm³  bbox=[39.5,-22.5,81.0] → [136.5,-2.5,109.0]
  Display: vol=120.0mm³  bbox=[100.5,-32.5,100.5] → [115.5,-24.5,101.5]
  Outdoor Unit: vol=142674.0mm³  bbox=[75.5,4.5,63.0] → [158.5,42.5,127.0]
  Fan Grille: vol=810.4mm³  bbox=[94.0,-24.0,94.0] → [140.0,22.0,96.0]
  Fan Blades: vol=480.0mm³  bbox=[91.8,-25.4,94.0] → [142.2,23.4,96.0]
  Fan Hub: vol=627.3mm³  bbox=[112.0,-6.0,91.0] → [122.0,4.0,99.0]
  Main Pipe: vol=1755.0mm³  bbox=[84.0,21.0,116.0] → [92.0,56.0,124.0]
  Refrigerant Line: vol=857.7mm³  bbox=[102.0,21.0,117.2] → [107.6,56.0,122.8]
  Drain Line: vol=629.3mm³  bbox=[85.6,21.0,101.2] → [90.4,56.0,106.0]
✓ Params: Wall Thickness, Wall Width, Wall Height, Indoor Width, Indoor Depth, Indoor Height, Outdoor Width, Outdoor Depth, Outdoor Height, Fan Radius, Pipe Radius
✓ Time: 17ms
```

# V2
```javascript
// Home AC Unit V2 - Fixed positioning
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

// === Build the wall (centered for easier positioning) ===
const wall = box(wallWidth, wallThick, wallHeight, true).color('#999999');

// === Indoor Unit (mounted on FRONT of wall) ===
// Main body
const indoorMain = box(indoorW, indoorD, indoorH, true).color('#e8e8e8');

// Vent grille at bottom - 2D sketch extruded
const vent = rect(indoorW - 8, 4, true).extrude(2).color('#555555');
const indoorWithVent = union(indoorMain, vent);

// Position: attach to front of wall, offset outward
const indoor = indoorWithVent.color('#f0f0f0')
  .attachTo(wall, 'front', 'front', [0, -indoorD / 2 - 2, 20]);

// Display panel on indoor unit - 2D sketch extruded
const display = rect(15, 8, true).extrude(1).color('#222222')
  .attachTo(indoor, 'front', 'back', [0, -1, indoorH / 2 - 8]);

// === Outdoor Unit (mounted on BACK of wall) ===
// Main body
const outdoorMain = box(outdoorW, outdoorD, outdoorH, true).color('#b8b8b8');

// Base/platform for outdoor unit
const outdoorBase = box(outdoorW + 8, outdoorD + 8, 6, true).color('#888888')
  .attachTo(outdoorMain, 'bottom', 'top', [0, 0, -3]);

const outdoorWithBase = union(outdoorMain, outdoorBase);

// Position: attach to back of wall, offset outward
const outdoor = outdoorWithBase.color('#cccccc')
  .attachTo(wall, 'back', 'back', [0, outdoorD / 2 + 2, 20]);

// === Fan Assembly (on front of outdoor unit) ===
// Fan grille - circle with hole
const grilleOuter = circle2d(fanR + 3).extrude(2).color('#666666');
const grilleInner = circle2d(fanR).extrude(3).color('#333333');
const grille = difference(grilleOuter, grilleInner)
  .attachTo(outdoor, 'front', 'front', [0, -1, 0]);

// Fan blades - radial pattern using 2D sketch extruded
const bladeSketch = box(3, fanR - 4, 2, true).translate(0, (fanR - 4) / 2 + 2, 0);
const fan = circularPattern(bladeSketch, 5).color('#666666')
  .attachTo(grille, 'center', 'center');

// Fan hub - cylinder pointing forward (along -Y)
const hub = cylinder(8, fanR / 4).color('#444444')
  .attachTo(grille, 'center', 'center');

// === Connector Pipes (through the wall) ===
// Get positions for pipe connection
const indoorBack = indoor.boundingBox().max;
const outdoorFront = outdoor.boundingBox().min;

// Main refrigerant pipe - goes from indoor back to outdoor front through wall
const pipeLen = outdoorFront[1] - indoorBack[1];
const mainPipe = cylinder(pipeLen, pipeR)
  .pointAlong([0, 1, 0])
  .translate(indoorBack[0], (indoorBack[1] + outdoorFront[1]) / 2, indoorBack[2] + 5)
  .color('#aa6644');

// Second refrigerant line - offset to the right
const line2 = cylinder(pipeLen, pipeR * 0.7)
  .pointAlong([0, 1, 0])
  .translate(indoorBack[0] + pipeR * 2 + 2, (indoorBack[1] + outdoorFront[1]) / 2, indoorBack[2] + 5)
  .color('#aa6644');

// Condensate drain line - lower down
const drain = cylinder(pipeLen, pipeR * 0.6)
  .pointAlong([0, 1, 0])
  .translate(indoorBack[0], (indoorBack[1] + outdoorFront[1]) / 2, indoorBack[2] - pipeR * 2 - 2)
  .color('#44aa66');

// Return all objects as separate items to preserve colors
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Unit", shape: indoor },
  { name: "Display", shape: display },
  { name: "Outdoor Unit", shape: outdoor },
  { name: "Fan Grille", shape: grille },
  { name: "Fan Blades", shape: fan },
  { name: "Fan Hub", shape: hub },
  { name: "Main Pipe", shape: mainPipe },
  { name: "Refrigerant Line", shape: line2 },
  { name: "Drain Line", shape: drain },
];
```

# User Feedback

Now, therea re no pipes.
The two boxes are partially inside each other.
The fan has horizontal position and goes through both boxes.
There is some black panel, and it also is horizontal.

```
npm run test-run examples/ac-unit-minimax.forge.js

> forgecad@0.1.0 test-run
> npx tsx cli/test-run.ts examples/ac-unit-minimax.forge.js

✓ Objects: 10
  Wall: vol=450000.0mm³  bbox=[-100.0,-7.5,-75.0] → [100.0,7.5,75.0]
  Indoor Unit: vol=39200.0mm³  bbox=[-35.0,-19.5,6.0] → [35.0,0.5,34.0]
  Display: vol=120.0mm³  bbox=[-7.5,-28.5,25.5] → [7.5,-20.5,26.5]
  Outdoor Unit: vol=142674.0mm³  bbox=[-41.5,-13.5,-12.0] → [41.5,24.5,52.0]
  Fan Grille: vol=810.4mm³  bbox=[-23.0,-14.5,19.0] → [23.0,31.5,21.0]
  Fan Blades: vol=480.0mm³  bbox=[-17.6,-8.2,19.0] → [17.6,25.2,21.0]
  Fan Hub: vol=627.3mm³  bbox=[-5.0,3.5,16.0] → [5.0,13.5,24.0]
  Main Pipe: vol=0.0mm³  bbox=[Infinity,Infinity,Infinity] → [-Infinity,-Infinity,-Infinity]
  Refrigerant Line: vol=0.0mm³  bbox=[Infinity,Infinity,Infinity] → [-Infinity,-Infinity,-Infinity]
  Drain Line: vol=0.0mm³  bbox=[Infinity,Infinity,Infinity] → [-Infinity,-Infinity,-Infinity]
✓ Params: Wall Thickness, Wall Width, Wall Height, Indoor Width, Indoor Depth, Indoor Height, Outdoor Width, Outdoor Depth, Outdoor Height, Fan Radius, Pipe Radius
✓ Time: 15ms
```

Final attempt?

# V3
```javascript
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
```

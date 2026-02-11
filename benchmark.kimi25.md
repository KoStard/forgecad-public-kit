---
hermes_append_context: /Users/kostard/Projects/CAD/ForgeCAD/docs/permanent, /Users/kostard/Projects/CAD/ForgeCAD/examples/api
---
# Goal

Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The internal part hanging from the wall. The external part as well hanging from the wall, has big fan. These parts are connected with a pipe.
Implement whatever features/methods you are missing in the script itself for your convenience.
Use the simpler primitives when unsure.
Put the script in a markdown block below.

# The script
```js

// Home AC Unit - Indoor and Outdoor components with connecting pipes
// Coordinate system: Z-up, Y-forward (indoor at -Y, outdoor at +Y)

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

// --- Wall (separates indoor and outdoor) ---
const wallW = Math.max(indoorW, outdoorW) + 200;
const wallH = 2500;
const wall = box(wallW, wallThick, wallH, true)
  .translate(0, 0, wallH / 2)
  .color('#E8E4D9'); // Off-white wall color

// --- Indoor Unit (on the -Y side of wall) ---
// Main body
const indoorBody = box(indoorW, indoorD, indoorH, true).color('#F5F5F5');

// Front panel with vent slats
const ventPanel = box(indoorW - 20, 5, indoorH * 0.6, true)
  .color('#E0E0E0')
  .attachTo(indoorBody, 'front', 'front', [0, -indoorD/2 - 2, -indoorH * 0.15]);

// Top vent (air outlet)
const topVent = box(indoorW - 40, indoorD - 10, 15, true)
  .color('#D0D0D0')
  .attachTo(indoorBody, 'top', 'top', [0, 0, -5]);

// Display panel
const display = box(80, 3, 30, true)
  .color('#1a1a2e')
  .attachTo(indoorBody, 'front', 'front', [indoorW * 0.3, -indoorD/2 - 1, indoorH * 0.25]);

// LED indicator
const led = cylinder(3, 2, undefined, 16, true)
  .color('#00ff00')
  .attachTo(display, 'front', 'center', [0, -2, 0]);

// Indoor mounting bracket (L-bracket attached to wall)
const indoorBracketV = box(60, 10, 100, true).color('#606060');
const indoorBracketH = box(60, 80, 10, true).color('#606060')
  .attachTo(indoorBracketV, 'top', 'bottom', [0, 35, 0]);
const indoorBracket = union(indoorBracketV, indoorBracketH)
  .attachTo(wall, 'left', 'right', [indoorW/2 - 30, -wallThick/2 - 10, mountHeight - indoorH/2 - 50]);

// Position indoor unit on bracket
const indoorUnit = group(indoorBody, ventPanel, topVent, display, led)
  .attachTo(indoorBracket, 'top', 'bottom', [0, -indoorD/2 - 5, indoorH/2 + 10]);

// --- Outdoor Unit (on the +Y side of wall) ---
// Main body
const outdoorBody = box(outdoorW, outdoorD, outdoorH, true).color('#FFFFFF');

// Fan grill (circular pattern)
const fanRadius = Math.min(outdoorW, outdoorH) * 0.35;
const fanGrill = cylinder(10, fanRadius, fanRadius, 32, true)
  .color('#404040')
  .attachTo(outdoorBody, 'front', 'front', [0, -outdoorD/2 - 2, 0]);

// Fan blades
const bladeCount = 5;
const fanBlades = [];
for (let i = 0; i < bladeCount; i++) {
  const angle = (i / bladeCount) * 360;
  const blade = box(fanRadius * 0.8, 3, 15, true)
    .color('#333333')
    .rotate(0, 0, angle)
    .translate(0, -outdoorD/2 - 3, 0);
  fanBlades.push(blade);
}
const fanAssembly = union(fanGrill, ...fanBlades);

// Side vents (grill pattern)
const sideVentW = 15;
const sideVentH = outdoorH * 0.6;
const sideVents = [];
for (let i = 0; i < 8; i++) {
  const x = (i - 3.5) * 25;
  const sv = box(8, 5, sideVentH, true)
    .color('#C0C0C0')
    .attachTo(outdoorBody, 'right', 'left', [x, outdoorD/2 - 5, 0]);
  sideVents.push(sv);
}

// Outdoor mounting brackets (feet)
const footW = 80;
const footD = 100;
const footH = 20;
const footL = box(footW, footD, footH, true).color('#505050');
const footR = box(footW, footD, footH, true).color('#505050');

// Position feet relative to outdoor body
const leftFoot = footL.attachTo(outdoorBody, 'bottom-left', 'top-left', [20, 0, -footH/2]);
const rightFoot = footR.attachTo(outdoorBody, 'bottom-right', 'top-right', [-20, 0, -footH/2]);

// Wall mounting plate for outdoor unit
const mountPlate = box(200, 10, 150, true).color('#505050')
  .attachTo(wall, 'right', 'left', [-outdoorW/2 + 100, wallThick/2 + 5, mountHeight - outdoorH/2 - 75]);

// Position outdoor assembly
const outdoorUnit = group(outdoorBody, fanAssembly, ...sideVents, leftFoot, rightFoot)
  .attachTo(mountPlate, 'right', 'left', [outdoorD/2 + 5, 0, outdoorH/2 - 75]);

// --- Connecting Pipes ---
// Two pipes (refrigerant lines) going through the wall
const pipeR = 12;
const pipeLen = wallThick + 100; // Through wall + some extension

// Calculate pipe positions based on bounding boxes
const indoorBB = indoorUnit.boundingBox();
const outdoorBB = outdoorUnit.boundingBox();

// Pipe Y positions (spanning from indoor to outdoor)
const indoorY = indoorBB.max[1];
const outdoorY = outdoorBB.min[1];
const pipeY1 = indoorY + (outdoorY - indoorY) * 0.3;
const pipeY2 = indoorY + (outdoorY - indoorY) * 0.7;
const pipeZ = mountHeight - indoorH/2 - 30;

// Pipe 1 - insulated (larger diameter)
const pipe1Indoor = cylinder(60, pipeR + 8, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#1a5f7a') // Blue insulation
  .translate(-pipeSpacing/2, indoorY - 30, pipeZ);

const pipe1Wall = cylinder(wallThick + 20, pipeR + 8, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#1a5f7a')
  .translate(-pipeSpacing/2, 0, pipeZ);

const pipe1Outdoor = cylinder(80, pipeR + 6, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#8B4513') // Copper color
  .translate(-pipeSpacing/2, outdoorY + 40, pipeZ);

// Pipe 2 - smaller line
const pipe2Indoor = cylinder(60, pipeR, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, indoorY - 30, pipeZ);

const pipe2Wall = cylinder(wallThick + 20, pipeR, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, 0, pipeZ);

const pipe2Outdoor = cylinder(80, pipeR, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#8B4513')
  .translate(pipeSpacing/2, outdoorY + 40, pipeZ);

// Wall sleeves (where pipes pass through wall)
const sleeve1 = cylinder(wallThick + 10, pipeR + 15, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#888888')
  .translate(-pipeSpacing/2, 0, pipeZ);

const sleeve2 = cylinder(wallThick + 10, pipeR + 10, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#888888')
  .translate(pipeSpacing/2, 0, pipeZ);

// Return all components as named objects for color control
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Bracket", shape: indoorBracket },
  { name: "Indoor Unit Body", shape: indoorBody },
  { name: "Indoor Vent", shape: ventPanel },
  { name: "Indoor Top Vent", shape: topVent },
  { name: "Display Panel", shape: display },
  { name: "Power LED", shape: led },
  { name: "Outdoor Mount Plate", shape: mountPlate },
  { name: "Outdoor Unit Body", shape: outdoorBody },
  { name: "Fan Grill & Blades", shape: fanAssembly },
  { name: "Side Vents", shape: union(...sideVents) },
  { name: "Outdoor Feet", shape: union(leftFoot, rightFoot) },
  { name: "Pipe 1 (Indoor)", shape: pipe1Indoor },
  { name: "Pipe 1 (Wall)", shape: pipe1Wall },
  { name: "Pipe 1 (Outdoor)", shape: pipe1Outdoor },
  { name: "Pipe 2 (Indoor)", shape: pipe2Indoor },
  { name: "Pipe 2 (Wall)", shape: pipe2Wall },
  { name: "Pipe 2 (Outdoor)", shape: pipe2Outdoor },
  { name: "Wall Sleeves", shape: union(sleeve1, sleeve2) },
];
```

# User Feedback

I see you have quite some primitives, buy your dimensions are completely confused.
The internal and external boxes are located below the wall, and the wall is somehow vertical.
The internal box is fully inside the external box. The big fan is laying horizontal. Bunch of small things are in weird locations...

```
npm run test-run examples/ac-unit-kimi25.forge.js

> forgecad@0.1.0 test-run
> npx tsx cli/test-run.ts examples/ac-unit-kimi25.forge.js

✓ Objects: 19
  Wall: vol=375000000.0mm³  bbox=[-500.0,-75.0,0.0] → [500.0,75.0,2500.0]
  Indoor Bracket: vol=108000.0mm³  bbox=[-240.0,-125.0,3020.0] → [-180.0,-45.0,3130.0]
  Indoor Unit Body: vol=35000000.0mm³  bbox=[-350.0,-100.0,-125.0] → [350.0,100.0,125.0]
  Indoor Vent: vol=510000.0mm³  bbox=[-340.0,-202.0,-112.5] → [340.0,-197.0,37.5]
  Indoor Top Vent: vol=1881000.0mm³  bbox=[-330.0,-95.0,105.0] → [330.0,95.0,120.0]
  Display Panel: vol=7200.0mm³  bbox=[170.0,-201.0,47.5] → [250.0,-198.0,77.5]
  Power LED: vol=36.7mm³  bbox=[208.0,-205.0,61.0] → [212.0,-201.0,64.0]
  Outdoor Mount Plate: vol=300000.0mm³  bbox=[200.0,75.0,2825.0] → [400.0,85.0,2975.0]
  Outdoor Unit Body: vol=132000000.0mm³  bbox=[-400.0,-150.0,-275.0] → [400.0,150.0,275.0]
  Fan Grill & Blades: vol=1167894.3mm³  bbox=[-192.5,-302.0,-7.5] → [192.5,83.0,7.5]
  Side Vents: vol=105600.0mm³  bbox=[312.5,142.5,-165.0] → [495.5,147.5,165.0]
  Outdoor Feet: vol=320000.0mm³  bbox=[-380.0,-50.0,-305.0] → [380.0,50.0,-285.0]
  Pipe 1 (Indoor): vol=73475.2mm³  bbox=[-60.0,-97.5,1825.0] → [-20.0,-37.5,1865.0]
  Pipe 1 (Wall): vol=208179.8mm³  bbox=[-60.0,-85.0,1825.0] → [-20.0,85.0,1865.0]
  Pipe 1 (Outdoor): vol=79353.2mm³  bbox=[-58.0,-146.0,1827.0] → [-22.0,-66.0,1863.0]
  Pipe 2 (Indoor): vol=26451.1mm³  bbox=[28.0,-97.5,1833.0] → [52.0,-37.5,1857.0]
  Pipe 2 (Wall): vol=74944.7mm³  bbox=[28.0,-85.0,1833.0] → [52.0,85.0,1857.0]
  Pipe 2 (Outdoor): vol=35268.1mm³  bbox=[28.0,-146.0,1833.0] → [52.0,-66.0,1857.0]
  Wall Sleeves: vol=594169.6mm³  bbox=[-67.0,-80.0,1818.0] → [62.0,80.0,1872.0]
✓ Params: Wall Thickness, Indoor Width, Indoor Height, Indoor Depth, Outdoor Width, Outdoor Height, Outdoor Depth, Mount Height, Pipe Spacing
✓ Time: 12ms
```

Chance to try again.

# V2
```js
// Home AC Unit - Indoor and Outdoor components with connecting pipes
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
// Wall centered at origin, extending from Z=0 at bottom to Z=wallH at top
const wall = box(wallW, wallThick, wallH, true)
  .translate(0, 0, wallH / 2)
  .color('#E8E4D9');

// --- Indoor Unit (on the -Y side of wall, front face) ---
// Main body - centered box
const indoorBody = box(indoorW, indoorD, indoorH, true).color('#F5F5F0');

// Position indoor body: back face flush with wall front, centered vertically at mountHeight
// Front of wall is at Y = -wallThick/2
// Indoor unit extends from Y = -wallThick/2 - indoorD to Y = -wallThick/2
const indoorUnitY = -wallThick/2 - indoorD/2;
const indoorUnitZ = mountHeight;

// Front panel with vent slats (at front face of indoor unit)
const ventPanel = box(indoorW - 20, 5, indoorH * 0.6, true)
  .color('#E0E0E0')
  .translate(0, indoorUnitY - indoorD/2 - 2, indoorUnitZ - indoorH * 0.15);

// Top vent (air outlet) - on top face of indoor unit
const topVent = box(indoorW - 40, indoorD - 10, 15, true)
  .color('#D0D0D0')
  .translate(0, indoorUnitY, indoorUnitZ + indoorH/2 - 5);

// Display panel (on front face)
const display = box(80, 3, 30, true)
  .color('#1a1a2e')
  .translate(indoorW * 0.3, indoorUnitY - indoorD/2 - 1, indoorUnitZ + indoorH * 0.25);

// LED indicator
const led = cylinder(2, 3, undefined, 16, true)
  .color('#00ff00')
  .pointAlong([0, -1, 0]) // Pointing forward (out of display)
  .translate(indoorW * 0.3, indoorUnitY - indoorD/2 - 3, indoorUnitZ + indoorH * 0.25);

// Indoor mounting bracket (wall-mounted L-bracket)
const bracketThick = 10;
const bracketW = 60;
const bracketV = box(bracketThick, bracketW, 100, true).color('#606060');
const bracketH = box(60, bracketThick, bracketW, true).color('#606060')
  .translate(0, bracketW/2, -50 + bracketThick/2);

// Position bracket on wall front, left side of indoor unit
const indoorBracketL = union(bracketV, bracketH)
  .translate(-indoorW/2 + 80, -wallThick/2 - bracketThick/2, mountHeight - indoorH/2);

const indoorBracketR = union(bracketV, bracketH)
  .translate(indoorW/2 - 80, -wallThick/2 - bracketThick/2, mountHeight - indoorH/2);

// Main indoor body positioned
const indoorMain = box(indoorW, indoorD, indoorH, true)
  .color('#F5F5F0')
  .translate(0, indoorUnitY, indoorUnitZ);

// --- Outdoor Unit (on the +Y side of wall, back face) ---
// Main body
const outdoorBody = box(outdoorW, outdoorD, outdoorH, true).color('#FFFFFF');

// Position outdoor body: front face flush with wall back
const outdoorUnitY = wallThick/2 + outdoorD/2;
const outdoorUnitZ = mountHeight - (outdoorH - indoorH)/2; // Align bottom with indoor unit

// Fan grill - vertical cylinder facing forward (along -Y)
const fanRadius = Math.min(outdoorW, outdoorH) * 0.35;
const fanGrill = cylinder(10, fanRadius, fanRadius, 32, true)
  .color('#404040')
  .pointAlong([0, -1, 0]) // Point along -Y (facing forward toward wall)
  .translate(0, outdoorUnitY + outdoorD/2 + 5, outdoorUnitZ);

// Fan blades (vertical, radiating from center)
const bladeCount = 5;
const fanBlades = [];
for (let i = 0; i < bladeCount; i++) {
  const angle = (i / bladeCount) * 360;
  const blade = box(fanRadius * 0.7, 5, 30, true)
    .color('#333333')
    .rotate(angle, 0, 0) // Rotate around fan axis (Y)
    .translate(0, outdoorUnitY + outdoorD/2 + 5, outdoorUnitZ);
  fanBlades.push(blade);
}

// Side vents (grill pattern on right side)
const sideVents = [];
for (let i = 0; i < 6; i++) {
  const y = (i - 2.5) * (outdoorH * 0.6 / 5);
  const sv = box(5, outdoorD - 20, 12, true)
    .color('#C0C0C0')
    .translate(outdoorW/2 + 2, outdoorUnitY, outdoorUnitZ + y);
  sideVents.push(sv);
}

// OutdoorUnit positioned
const outdoorMain = box(outdoorW, outdoorD, outdoorH, true)
  .color('#FFFFFF')
  .translate(0, outdoorUnitY, outdoorUnitZ);

// Outdoor mounting brackets (feet to mount on wall or stand)
const footW = 100;
const footD = 15;
const footH = 40;

const leftFoot = box(footD, outdoorD - 20, footH, true)
  .color('#505050')
  .translate(-outdoorW/2 + 100, outdoorUnitY, outdoorUnitZ - outdoorH/2 - footH/2);

const rightFoot = box(footD, outdoorD - 20, footH, true)
  .color('#505050')
  .translate(outdoorW/2 - 100, outdoorUnitY, outdoorUnitZ - outdoorH/2 - footH/2);

// Wall mounting plate (for outdoor unit)
const mountPlate = box(200, 10, 200, true)
  .color('#505050')
  .translate(0, wallThick/2 + 5, outdoorUnitZ);

// --- Connecting Pipes ---
// Two pipes (refrigerant lines) going through the wall
const pipeR = 12;

// Pipe Z position (below indoor unit)
const pipeZ = mountHeight - indoorH/2 - 50;

// Pipe 1 - insulated (larger diameter)
const pipe1Wall = cylinder(wallThick + 40, pipeR + 8, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#1a5f7a') // Blue insulation
  .translate(-pipeSpacing/2, 0, pipeZ);

const pipe1Indoor = cylinder(150, pipeR + 8, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')
  .translate(-pipeSpacing/2, indoorUnitY + indoorD/2 + 75, pipeZ);

const pipe1Outdoor = cylinder(250, pipeR + 6, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#8B4513') // Copper color
  .translate(-pipeSpacing/2, outdoorUnitY - outdoorD/2 - 125, pipeZ);

// Pipe 2 - smaller line
const pipe2Wall = cylinder(wallThick + 40, pipeR, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, 0, pipeZ);

const pipe2Indoor = cylinder(150, pipeR, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, indoorUnitY + indoorD/2 + 75, pipeZ);

const pipe2Outdoor = cylinder(250, pipeR, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#8B4513')
  .translate(pipeSpacing/2, outdoorUnitY - outdoorD/2 - 125, pipeZ);

// Wall sleeves (where pipes pass through wall)
const sleeve1 = cylinder(wallThick + 20, pipeR + 15, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#888888')
  .translate(-pipeSpacing/2, 0, pipeZ);

const sleeve2 = cylinder(wallThick + 20, pipeR + 10, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#888888')
  .translate(pipeSpacing/2, 0, pipeZ);

return [
  { name: "Wall", shape: wall },
  { name: "Indoor Brackets", shape: group(indoorBracketL, indoorBracketR) },
  { name: "Indoor Unit Body", shape: indoorMain },
  { name: "Indoor Vent", shape: ventPanel },
  { name: "Indoor Top Vent", shape: topVent },
  { name: "Display Panel", shape: display },
  { name: "Power LED", shape: led },
  { name: "Outdoor Mount Plate", shape: mountPlate },
  { name: "Outdoor Unit Body", shape: outdoorMain },
  { name: "Fan Grill", shape: fanGrill },
  { name: "Fan Blades", shape: group(...fanBlades) },
  { name: "Side Vents", shape: group(...sideVents) },
  { name: "Outdoor Feet", shape: group(leftFoot, rightFoot) },
  { name: "Pipe 1 (Indoor)", shape: pipe1Indoor },
  { name: "Pipe 1 (Wall)", shape: pipe1Wall },
  { name: "Pipe 1 (Outdoor)", shape: pipe1Outdoor },
  { name: "Pipe 2 (Indoor)", shape: pipe2Indoor },
  { name: "Pipe 2 (Wall)", shape: pipe2Wall },
  { name: "Pipe 2 (Outdoor)", shape: pipe2Outdoor },
  { name: "Wall Sleeves", shape: union(sleeve1, sleeve2) },
];
```

# User Feedback

Very nice.
One last feedback.
The pipes are not at the right elevation for the internal block. It comes right through the wall, from the external part, but then is just sticking outside, not going into the internal piece. Fix this one as well.

```
npm run test-run examples/ac-unit-kimi25.forge.js

> forgecad@0.1.0 test-run
> npx tsx cli/test-run.ts examples/ac-unit-kimi25.forge.js

✓ Objects: 31
  Wall: vol=375000000.0mm³  bbox=[-500.0,-75.0,0.0] → [500.0,75.0,2500.0]
  Indoor Brackets.1: vol=94250.0mm³  bbox=[-300.0,-110.0,1800.0] → [-240.0,-45.0,1925.0]
  Indoor Brackets.2: vol=94250.0mm³  bbox=[240.0,-110.0,1800.0] → [300.0,-45.0,1925.0]
  Indoor Unit Body: vol=35000000.0mm³  bbox=[-350.0,-275.0,1875.0] → [350.0,-75.0,2125.0]
  Indoor Vent: vol=510000.0mm³  bbox=[-340.0,-279.5,1887.5] → [340.0,-274.5,2037.5]
  Indoor Top Vent: vol=1881000.0mm³  bbox=[-330.0,-270.0,2112.5] → [330.0,-80.0,2127.5]
  Display Panel: vol=7200.0mm³  bbox=[170.0,-277.5,2047.5] → [250.0,-274.5,2077.5]
  Power LED: vol=55.1mm³  bbox=[207.0,-279.0,2059.5] → [213.0,-277.0,2065.5]
  Outdoor Mount Plate: vol=400000.0mm³  bbox=[-100.0,75.0,1750.0] → [100.0,85.0,1950.0]
  Outdoor Unit Body: vol=132000000.0mm³  bbox=[-400.0,75.0,1575.0] → [400.0,375.0,2125.0]
  Fan Grill: vol=1156690.5mm³  bbox=[-192.5,375.0,1657.5] → [192.5,385.0,2042.5]
  Fan Blades.1: vol=20212.5mm³  bbox=[-67.4,377.5,1835.0] → [67.4,382.5,1865.0]
  Fan Blades.2: vol=20212.5mm³  bbox=[-67.4,365.0,1843.0] → [67.4,395.0,1857.0]
  Fan Blades.3: vol=20212.5mm³  bbox=[-67.4,369.2,1836.4] → [67.4,390.8,1863.6]
  Fan Blades.4: vol=20212.5mm³  bbox=[-67.4,369.2,1836.4] → [67.4,390.8,1863.6]
  Fan Blades.5: vol=20212.5mm³  bbox=[-67.4,365.0,1843.0] → [67.4,395.0,1857.0]
  Side Vents.1: vol=16800.0mm³  bbox=[399.5,85.0,1679.0] → [404.5,365.0,1691.0]
  Side Vents.2: vol=16800.0mm³  bbox=[399.5,85.0,1745.0] → [404.5,365.0,1757.0]
  Side Vents.3: vol=16800.0mm³  bbox=[399.5,85.0,1811.0] → [404.5,365.0,1823.0]
  Side Vents.4: vol=16800.0mm³  bbox=[399.5,85.0,1877.0] → [404.5,365.0,1889.0]
  Side Vents.5: vol=16800.0mm³  bbox=[399.5,85.0,1943.0] → [404.5,365.0,1955.0]
  Side Vents.6: vol=16800.0mm³  bbox=[399.5,85.0,2009.0] → [404.5,365.0,2021.0]
  Outdoor Feet.1: vol=168000.0mm³  bbox=[-307.5,85.0,1535.0] → [-292.5,365.0,1575.0]
  Outdoor Feet.2: vol=168000.0mm³  bbox=[292.5,85.0,1535.0] → [307.5,365.0,1575.0]
  Pipe 1 (Indoor): vol=183688.0mm³  bbox=[-60.0,-75.0,1805.0] → [-20.0,75.0,1845.0]
  Pipe 1 (Wall): vol=232671.5mm³  bbox=[-60.0,-95.0,1805.0] → [-20.0,95.0,1845.0]
  Pipe 1 (Outdoor): vol=247978.9mm³  bbox=[-58.0,-175.0,1807.0] → [-22.0,75.0,1843.0]
  Pipe 2 (Indoor): vol=66127.7mm³  bbox=[28.0,-75.0,1813.0] → [52.0,75.0,1837.0]
  Pipe 2 (Wall): vol=83761.7mm³  bbox=[28.0,-95.0,1813.0] → [52.0,95.0,1837.0]
  Pipe 2 (Outdoor): vol=110212.8mm³  bbox=[28.0,-175.0,1813.0] → [52.0,75.0,1837.0]
  Wall Sleeves: vol=631305.2mm³  bbox=[-67.0,-85.0,1798.0] → [62.0,85.0,1852.0]
✓ Params: Wall Thickness, Indoor Width, Indoor Height, Indoor Depth, Outdoor Width, Outdoor Height, Outdoor Depth, Mount Height, Pipe Spacing
✓ Time: 5ms
```

# V3

```js
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
const led = cylinder(2, 3, undefined, 16, true)
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
const fanGrill = cylinder(10, fanRadius, fanRadius, 32, true)
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
const pipe1Outdoor = cylinder(200, pipeR + 6, undefined, 16, true)
  .pointAlong([0, -1, 0])  // Points toward -Y (toward wall)
  .color('#8B4513')  // Copper
  .translate(-pipeSpacing/2, outdoorUnitY - outdoorD/2 - 50, pipeZ);

// Wall segment: through the wall thickness
const pipe1Wall = cylinder(wallThick + 20, pipeR + 8, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')  // Blue insulation
  .translate(-pipeSpacing/2, 0, pipeZ);

// Indoor segment: from wall (Y=-75) extending into indoor unit (to Y=-175 center)
const pipe1Indoor = cylinder(120, pipeR + 8, undefined, 16, true)
  .pointAlong([0, -1, 0])  // Points toward -Y (into indoor unit)
  .color('#1a5f7a')
  .translate(-pipeSpacing/2, indoorUnitY + indoorD/2 - 60, pipeZ);

// Pipe 2 - smaller line
const pipe2Outdoor = cylinder(200, pipeR, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#8B4513')
  .translate(pipeSpacing/2, outdoorUnitY - outdoorD/2 - 50, pipeZ);

const pipe2Wall = cylinder(wallThick + 20, pipeR, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, 0, pipeZ);

const pipe2Indoor = cylinder(120, pipeR, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#1a5f7a')
  .translate(pipeSpacing/2, indoorUnitY + indoorD/2 - 60, pipeZ);

// Wall sleeves
const sleeve1 = cylinder(wallThick + 10, pipeR + 15, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#888888')
  .translate(-pipeSpacing/2, 0, pipeZ);

const sleeve2 = cylinder(wallThick + 10, pipeR + 10, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#888888')
  .translate(pipeSpacing/2, 0, pipeZ);

// Connection points (visual only - where pipes enter the units)
const conn1Indoor = cylinder(20, pipeR + 10, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#606060')
  .translate(-pipeSpacing/2, indoorUnitY + indoorD/2, pipeZ);

const conn1Outdoor = cylinder(20, pipeR + 8, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#606060')
  .translate(-pipeSpacing/2, outdoorUnitY - outdoorD/2, pipeZ);

const conn2Indoor = cylinder(20, pipeR + 4, undefined, 16, true)
  .pointAlong([0, -1, 0])
  .color('#606060')
  .translate(pipeSpacing/2, indoorUnitY + indoorD/2, pipeZ);

const conn2Outdoor = cylinder(20, pipeR + 2, undefined, 16, true)
  .pointAlong([0, 1, 0])
  .color('#606060')
  .translate(pipeSpacing/2, outdoorUnitY - outdoorD/2, pipeZ);

return [
  { name: "Wall", shape: wall },
  { name: "Indoor Brackets", shape: group(indoorBracketL, indoorBracketR) },
  { name: "Indoor Unit Body", shape: indoorBody },
  { name: "Indoor Vent", shape: ventPanel },
  { name: "Indoor Top Vent", shape: topVent },
  { name: "Display Panel", shape: display },
  { name: "Power LED", shape: led },
  { name: "Outdoor Mount Plate", shape: mountPlate },
  { name: "Outdoor Unit Body", shape: outdoorBody },
  { name: "Fan Grill", shape: fanGrill },
  { name: "Fan Blades", shape: group(...fanBlades) },
  { name: "Side Vents", shape: group(...sideVents) },
  { name: "Outdoor Feet", shape: group(leftFoot, rightFoot) },
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
```

# User Feedback
Great job.
One minor thing I notice is that there is some kind of blackish back plate on the external box, it's positioned so close to the back of the external box that it creates rendering artifacts
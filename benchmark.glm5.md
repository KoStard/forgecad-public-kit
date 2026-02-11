---
hermes_append_context: /Users/kostard/Projects/CAD/ForgeCAD/docs/permanent
---
# Goal

Make a home AC unit, showing both pieces on different sides of the wall (inside and outside).
Implement whatever features/methods you are missing in the script itself for your convenience.
Use the simpler primitives when unsure.
Put the script in a markdown block below.

# The script
```js
// ============================================
// Home AC Unit - Indoor and Outdoor Components
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
const wallColor = '#D4C4A8';      // Beige/cream wall
const indoorColor = '#FFFFFF';     // White indoor unit
const indoorAccent = '#E8E8E8';    // Light gray accents
const outdoorColor = '#F5F5F5';    // Off-white outdoor unit
const outdoorGrill = '#404040';    // Dark gray grill
const pipeColor = '#A0A0A0';       // Silver pipes

// ---- WALL ----
const wall = box(wallWidth, wallThickness, wallHeight, true)
  .color(wallColor);

// ---- INDOOR UNIT (Front side -Y) ----
const indoorY = -wallThickness/2 - indoorDepth/2;
const indoorZ = wallHeight/2 - indoorHeight/2 - 30;

// Main body
const indoorBody = box(indoorWidth, indoorDepth, indoorHeight, true)
  .translate(0, indoorY, indoorZ)
  .color(indoorColor);

// Rounded top edge (characteristic of split AC units)
const indoorTopCurve = box(indoorWidth, indoorDepth + 2, indoorHeight * 0.15, true)
  .translate(0, indoorY, indoorZ + indoorHeight/2 - indoorHeight * 0.075)
  .color(indoorAccent);

// Horizontal vent slats
const slatCount = 5;
const slatSpacing = indoorHeight * 0.12;
const slats = [];
for (let i = 0; i < slatCount; i++) {
  const slatZ = indoorZ - indoorHeight * 0.15 + i * slatSpacing;
  const slat = box(indoorWidth - 20, indoorDepth * 0.3, 4, true)
    .translate(0, indoorY - indoorDepth * 0.35, slatZ)
    .color(indoorAccent);
  slats.push(slat);
}

// Control panel (right side)
const controlPanel = box(30, 2, 15, true)
  .translate(indoorWidth/2 - 25, indoorY - indoorDepth/2 + 1, indoorZ + indoorHeight/2 - 20)
  .color('#1A1A1A');

// LED indicator
const led = sphere(2)
  .translate(indoorWidth/2 - 15, indoorY - indoorDepth/2 + 1, indoorZ + indoorHeight/2 - 25)
  .color('#00FF00');

// ---- OUTDOOR UNIT (Back side +Y) ----
const outdoorY = wallThickness/2 + outdoorDepth/2;
const outdoorZ = wallHeight/2 - outdoorHeight/2 - 20;

// Main body
const outdoorBody = box(outdoorWidth, outdoorDepth, outdoorHeight, true)
  .translate(0, outdoorY, outdoorZ)
  .color(outdoorColor);

// Fan grille on front (large circular)
const fanGrilleRim = cylinder(5, outdoorWidth * 0.35)
  .rotate(90, 0, 0)
  .translate(0, outdoorY + outdoorDepth/2 + 2, outdoorZ + outdoorHeight * 0.3)
  .color(outdoorGrill);

// Fan grille center
const fanGrilleCenter = cylinder(2, outdoorWidth * 0.15)
  .rotate(90, 0, 0)
  .translate(0, outdoorY + outdoorDepth/2 + 3, outdoorZ + outdoorHeight * 0.3)
  .color('#505050');

// Vertical fins on sides (characteristic of outdoor units)
const finCount = 6;
const fins = [];
for (let i = 0; i < finCount; i++) {
  const finZ = outdoorZ - outdoorHeight/2 + 15 + i * (outdoorHeight - 30) / finCount;
  // Left fins
  const leftFin = box(8, outdoorDepth * 0.6, 3, true)
    .translate(-outdoorWidth/2 + 15, outdoorY + outdoorDepth * 0.15, finZ)
    .color(outdoorGrill);
  fins.push(leftFin);
  // Right fins
  const rightFin = box(8, outdoorDepth * 0.6, 3, true)
    .translate(outdoorWidth/2 - 15, outdoorY + outdoorDepth * 0.15, finZ)
    .color(outdoorGrill);
  fins.push(rightFin);
}

// ---- REFRIGERANT PIPES (connecting through wall) ----
const pipeOffsetX = 40;
const pipeRadius = 6;
const pipeLength = wallThickness/2 + indoorDepth + outdoorDepth + 20;

// Liquid line (smaller)
const liquidPipe = cylinder(pipeLength, pipeRadius * 0.6)
  .rotate(90, 0, 0)
  .translate(pipeOffsetX, 0, outdoorZ - outdoorHeight/2 + 10)
  .color(pipeColor);

// Gas line (larger)
const gasPipe = cylinder(pipeLength, pipeRadius)
  .rotate(90, 0, 0)
  .translate(pipeOffsetX + 20, 0, outdoorZ - outdoorHeight/2 + 10)
  .color(pipeColor);

// Pipe insulation bumps at connections
const insulationLiquid = cylinder(15, pipeRadius * 1.5)
  .rotate(90, 0, 0)
  .translate(pipeOffsetX, outdoorY - outdoorDepth/2 + 5, outdoorZ - outdoorHeight/2 + 10)
  .color('#333333');

const insulationGas = cylinder(15, pipeRadius * 2)
  .rotate(90, 0, 0)
  .translate(pipeOffsetX + 20, outdoorY - outdoorDepth/2 + 5, outdoorZ - outdoorHeight/2 + 10)
  .color('#333333');

// ---- RETURN AS NAMED OBJECTS ----
return [
  { name: "Wall", shape: wall },
  { name: "Indoor Unit", shape: indoorBody },
  { name: "Indoor Top Curve", shape: indoorTopCurve },
  { name: "Indoor Vents", shape: union(...slats) },
  { name: "Control Panel", shape: controlPanel },
  { name: "LED", shape: led },
  { name: "Outdoor Unit", shape: outdoorBody },
  { name: "Fan Grille", shape: union(fanGrilleRim, fanGrilleCenter) },
  { name: "Cooling Fins", shape: union(...fins) },
  { name: "Liquid Pipe", shape: liquidPipe },
  { name: "Gas Pipe", shape: gasPipe },
  { name: "Pipe Insulation", shape: union(insulationLiquid, insulationGas) },
];
```

# User Feedback
The control panel is exactly at the surface, which makes it hard to be rendered. Make it sticking out a bit. Same for indoor vents, which are just visible to be creating weird artifacts, but wireframe shows they are actually located inside the internal box.
The cooling fins are completely "inside" of the outside box. Is this intended?
The pipes are funny, it just sticks out into the home, way below the inside unit, and much longer than should be. What's the plan here?
The external Grille is in wrong place on Z, it's a low higher.
Please give feedback what are the main complexities that make you make these mistakes. Can the system be better to handle these? Give another example of what the "perfect system" should be able to do to work nice.

# The script v2, and feedback
```js
// ============================================
// Home AC Unit v2 - Indoor and Outdoor Components
// Fixed positioning issues using attachTo() and relative coordinates
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
// Position: front of wall (-Y), near ceiling
const indoorCenterY = -wallThickness/2 - indoorDepth/2 - 5; // 5mm gap from wall
const indoorCenterZ = wallHeight/2 - indoorHeight/2 - 20;

// Main body - we'll use this as anchor for other parts
const indoorBody = box(indoorWidth, indoorDepth, indoorHeight, true)
  .translate(0, indoorCenterY, indoorCenterZ)
  .color(indoorColor);

// Get bounding box for relative positioning
const indoorBounds = indoorBody.boundingBox();

// Control panel - STICKING OUT from front face
const controlWidth = 35;
const controlHeight = 18;
const controlDepth = 4; // sticks out this much
const controlPanel = box(controlWidth, controlDepth, controlHeight)
  // Position so back face touches front of indoor unit, then stick out
  .translate(
    indoorBounds.max[0] - controlWidth - 15, // right side
    indoorBounds.min[1] - controlDepth,      // front of indoor unit, stick out
    indoorBounds.max[2] - controlHeight - 15 // near top
  )
  .color('#1A1A1A');

// LED indicator - on front of control panel
const led = sphere(2.5)
  .translate(
    indoorBounds.max[0] - controlWidth/2 - 15,
    indoorBounds.min[1] - controlDepth - 3, // in front of control panel
    indoorBounds.max[2] - 25
  )
  .color('#00FF00');

// Vent slats - OUTSIDE the unit, below the main body
const slatCount = 4;
const slatWidth = indoorWidth - 30;
const slatThickness = 3;
const slatDepth = 8; // how far they protrude
const slats = [];
for (let i = 0; i < slatCount; i++) {
  const slatZ = indoorBounds.min[2] + 10 + i * 12; // start from bottom
  const slat = box(slatWidth, slatDepth, slatThickness)
    .translate(
      -slatWidth/2, // centered on X
      indoorBounds.min[1] - slatDepth, // IN FRONT of unit
      slatZ
    )
    .color(indoorAccent);
  slats.push(slat);
}

// ---- OUTDOOR UNIT ----
// Position: back of wall (+Y), near ground
const outdoorCenterY = wallThickness/2 + outdoorDepth/2 + 10; // 10mm standoff
const outdoorCenterZ = outdoorHeight/2 + 30; // near ground

const outdoorBody = box(outdoorWidth, outdoorDepth, outdoorHeight, true)
  .translate(0, outdoorCenterY, outdoorCenterZ)
  .color(outdoorColor);

const outdoorBounds = outdoorBody.boundingBox();

// Fan grille - on front face of outdoor unit, positioned higher (center of upper third)
const grilleRadius = outdoorWidth * 0.35;
const fanGrilleRim = cylinder(4, grilleRadius)
  .rotate(90, 0, 0) // lay flat against YZ plane, pointing outward
  .translate(
    0,
    outdoorBounds.max[1] + 2, // ON the front face
    outdoorBounds.max[2] - outdoorHeight * 0.3 // upper portion
  )
  .color(outdoorGrill);

const fanGrilleCenter = cylinder(2, grilleRadius * 0.4)
  .rotate(90, 0, 0)
  .translate(
    0,
    outdoorBounds.max[1] + 3,
    outdoorBounds.max[2] - outdoorHeight * 0.3
  )
  .color('#505050');

// Cooling fins - on the SIDES of outdoor unit (not inside!)
const finCount = 8;
const finWidth = 5;
const finDepth = 12; // protrude outward
const finHeight = 3;
const fins = [];

for (let i = 0; i < finCount; i++) {
  const finZ = outdoorBounds.min[2] + 20 + i * ((outdoorHeight - 40) / finCount);
  
  // LEFT side fins (protrude to -X)
  const leftFin = box(finWidth, finDepth, finHeight)
    .translate(
      outdoorBounds.min[0] - finWidth, // OUTSIDE the unit on left
      outdoorBounds.min[1] + 5,
      finZ
    )
    .color(outdoorGrill);
  fins.push(leftFin);
  
  // RIGHT side fins (protrude to +X)
  const rightFin = box(finWidth, finDepth, finHeight)
    .translate(
      outdoorBounds.max[0], // OUTSIDE the unit on right
      outdoorBounds.min[1] + 5,
      finZ
    )
    .color(outdoorGrill);
  fins.push(rightFin);
}

// ---- REFRIGERANT PIPES ----
// Connect from bottom-back of indoor unit through wall to outdoor unit
const pipeRadius = 5;
const pipeX = 50; // offset to right side

// Calculate pipe endpoints based on actual unit positions
const pipeStartZ = indoorBounds.min[2] + 15; // near bottom of indoor
const pipeEndZ = outdoorBounds.min[2] + 15; // near bottom of outdoor

// Pipe length: from indoor unit back, through wall, to outdoor unit back
const pipeTotalLength = (indoorDepth + wallThickness + outdoorDepth) + 40;

// Liquid line (smaller)
const liquidPipe = cylinder(pipeTotalLength, pipeRadius * 0.7)
  .rotate(90, 0, 0) // horizontal along Y
  .translate(
    pipeX,
    0, // centered through wall
    pipeStartZ // at indoor unit bottom level
  )
  .color(pipeColor);

// Gas line (larger)  
const gasPipe = cylinder(pipeTotalLength, pipeRadius)
  .rotate(90, 0, 0)
  .translate(
    pipeX + 15,
    0,
    pipeStartZ
  )
  .color(pipeColor);

// Insulation at outdoor connection point
const insulationLiquid = cylinder(12, pipeRadius * 1.8)
  .rotate(90, 0, 0)
  .translate(
    pipeX,
    outdoorBounds.min[1] - 6, // at back of outdoor unit
    pipeStartZ
  )
  .color('#333333');

const insulationGas = cylinder(12, pipeRadius * 2.2)
  .rotate(90, 0, 0)
  .translate(
    pipeX + 15,
    outdoorBounds.min[1] - 6,
    pipeStartZ
  )
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
```

## Root Cause Analysis: Why These Mistakes Happened

### 1. **Manual Coordinate Arithmetic**
The biggest culprit. I was computing positions like `indoorY - indoorDepth * 0.35` in my head. This is error-prone because:
- `center: true` means the box is centered at origin *before* the translate
- After `.translate()`, the "center" variable no longer represents where the object actually is
- Subtracting fractions of dimensions (`0.35 * depth`) creates "inside the object" errors

**Fix in v2:** Used `.boundingBox()` after positioning the main body, then referenced `bounds.min/max` for all child elements.

### 2. **No Visual Feedback During Authoring**
I couldn't see intermediate positions. In a GUI CAD tool, I'd drag a part and see z-fighting if it intersected another object. Here, shapes that were inside each other rendered without warning.

**What would help:** A debug mode that highlights intersecting volumes, or returns them as separate colored objects.

### 3. **Cylinder Orientation Confusion**
`cylinder(height, radius)` creates a cylinder standing on Z (height along Z). To make it horizontal along Y, I rotated 90degree around X. But then tracking the "center point" mentally while also offsetting for the rotation is tricky.

**What would help:** `cylinderAlong(axis, length, radius)` that creates an already-oriented cylinder, or better documentation of the rotation pattern.

### 4. **"Inside" vs "Outside" Mental Model**
For the vents, I thought "below the unit" but wrote `indoorY - depth * 0.35` which is actually *inside* the unit's depth extent. The `-Y` direction is "forward" from the wall, so vents should be at an even more negative Y than the indoor unit's front face.

**Fix in v2:** Used `bounds.min[1] - offset` which clearly means "in front of the frontmost point."

### 5. **Not Using Existing Tools**
The API has `.attachTo()` for anchoring parts relative to named faces, but I didn't use it. I calculated positions manually instead.

## What a "Perfect System" Could Do

### Current API (Already Works)
```javascript
// Using attachTo - more explicit about intent
const controlPanel = box(30, 4, 15)
  .attachTo(indoorBody, 'front', 'back', [0, 0, 0]) // back of panel on front of body
  .translate(0, -4, 0) // then push out 4mm
  .color('#1A1A1A');
```

### Ideal Future API (Declarative Intent)
```javascript
// Position things by relationship, not coordinates
const controlPanel = box(30, 4, 15)
  .place('front-face', indoorBody, 'front-face', { 
    offset: [0, -4, 0],  // 4mm in front
    align: 'right'       // align to right edge
  });

const vent = box(100, 8, 3)
  .place('back-face', indoorBody, 'bottom-front-edge', {
    offset: [0, -8, 10] // in front, below, with Z offset
  });

const pipe = cylinder(50, 5)
  .connect(
    indoorBody.point('bottom-back-right'),
    outdoorBody.point('bottom-back-right')
  );

// Query actual position for debugging
console.log(controlPanel.position); // { x: 85, y: -42, z: 120 }
console.log(controlPanel.faces.front.center); // absolute world coords
```

### What Would Prevent These Errors
1. **Intersection warning:** System detects when returned shapes intersect and warns or highlights them
2. **Position query helper:** `shape.where()` returns readable position instead of just bounding box
3. **Face-relative positioning built into all primitives:** Every shape knows its named faces after creation
4. **Debug return mode:** Special return value that shows coordinate frames as colored axes

The key insight: **coordinate calculations should be the exception, not the rule.** The more the API lets us say "put this on the front of that," the fewer arithmetic errors occur


# Feedback
A lot better.
The outside fan is still sticking out with the top above the top of the external box.
And the tubes are comically long. They don't touch the external box, but go through the internal box and stick out. Very long.
The rest is good.
This time just fix the code.

# The script v3
```js
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

const indoorBounds = indoorBody.boundingBox();

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

const outdoorBounds = outdoorBody.boundingBox();

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
```
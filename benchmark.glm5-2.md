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

// Home AC Unit - Indoor and Outdoor units connected by pipes

// Parameters
const wallThick = param("Wall Thickness", 20, { min: 10, max: 40, unit: "mm" });
const indoorWidth = param("Indoor Width", 80, { min: 60, max: 120, unit: "mm" });
const indoorHeight = param("Indoor Height", 30, { min: 20, max: 50, unit: "mm" });
const indoorDepth = param("Indoor Depth", 20, { min: 15, max: 35, unit: "mm" });
const outdoorWidth = param("Outdoor Width", 70, { min: 50, max: 100, unit: "mm" });
const outdoorHeight = param("Outdoor Height", 55, { min: 40, max: 80, unit: "mm" });
const outdoorDepth = param("Outdoor Depth", 30, { min: 20, max: 50, unit: "mm" });

// --- Wall (reference) ---
const wall = box(120, wallThick, 100, true).color('#d4c4a8');

// --- INDOOR UNIT ---
// Main body
const indoorBody = box(indoorWidth, indoorDepth, indoorHeight, true)
  .color('#f5f5f5')
  .attachTo(wall, 'front', 'back', [0, -indoorDepth/2, 15]);

// Front panel with slight curve feel (using rounded rect extruded)
const frontPanel = roundedRect(indoorWidth - 4, indoorHeight - 4, 3, true)
  .extrude(2)
  .color('#ffffff')
  .attachTo(indoorBody, 'front', 'back', [0, -1, 0]);

// Air outlet vents (horizontal slats)
const ventCount = 5;
const ventSpacing = indoorHeight / (ventCount + 1);
const vents = [];
for (let i = 1; i <= ventCount; i++) {
  const z = -indoorHeight/2 + i * ventSpacing;
  const vent = box(indoorWidth - 20, 2, 3)
    .color('#333333')
    .attachTo(frontPanel, 'front', 'back', [0, -1, z]);
  vents.push(vent);
}

// Display panel
const display = box(15, 1, 6)
  .color('#1a1a2e')
  .attachTo(frontPanel, 'front', 'back', [indoorWidth/4, -1, indoorHeight/4]);

// LED indicator
const led = sphere(1.5).color('#00ff00').attachTo(display, 'front', 'front', [0, -1, -2]);

// Mounting bracket on back
const bracket = box(indoorWidth - 10, 3, 5)
  .color('#888888')
  .attachTo(indoorBody, 'back', 'front');

// --- OUTDOOR UNIT ---
const outdoorBody = box(outdoorWidth, outdoorDepth, outdoorHeight, true)
  .color('#e8e8e8')
  .attachTo(wall, 'back', 'front', [0, outdoorDepth/2 + 5, -10]);

// Big fan housing (circular)
const fanHousing = cylinder(outdoorDepth - 5, outdoorHeight * 0.35)
  .color('#555555')
  .attachTo(outdoorBody, 'front', 'back', [-outdoorWidth/4, -1, outdoorHeight/6]);

// Fan blades (simplified as disc with radial divisions)
const fanBlade = cylinder(3, outdoorHeight * 0.32)
  .color('#222222')
  .attachTo(fanHousing, 'front', 'front');

// Fan grille (concentric rings)
const grilleInner = circle2d(outdoorHeight * 0.15).color('#666666');
const grilleMiddle = circle2d(outdoorHeight * 0.25)
  .subtract(circle2d(outdoorHeight * 0.20))
  .color('#666666');
const grilleOuter = circle2d(outdoorHeight * 0.32)
  .subtract(circle2d(outdoorHeight * 0.28))
  .color('#666666');
const grille = union2d(grilleInner, grilleMiddle, grilleOuter)
  .extrude(0.5)
  .attachTo(fanBlade, 'front', 'front');

// Heat exchanger fins on side
const finCount = 8;
const fins = [];
for (let i = 0; i < finCount; i++) {
  const fin = box(0.5, outdoorDepth - 5, outdoorHeight - 10, true)
    .color('#cc8844')
    .translate(
      -outdoorWidth/2 + i * 3 + outdoorWidth * 0.6,
      outdoorDepth/2 + 2.5,
      0
    );
  fins.push(fin);
}

// Outdoor unit legs
const legHeight = 5;
const leg1 = box(8, 8, legHeight).color('#444444')
  .attachTo(outdoorBody, 'bottom-left', 'top', [10, 10, -legHeight/2]);
const leg2 = box(8, 8, legHeight).color('#444444')
  .attachTo(outdoorBody, 'bottom-right', 'top', [-10, 10, -legHeight/2]);

// --- CONNECTING PIPES ---
const pipeRadius = 4;

// Pipe exit from indoor unit (bottom back)
const indoorPipeExit = [-indoorWidth/3, -indoorDepth/2, -indoorHeight/2 + 5];

// Pipe entry to outdoor unit (bottom front)
const outdoorPipeEntry = [outdoorWidth/3, outdoorDepth/2 + 5, -outdoorHeight/2 + 10];

// Vertical drop from indoor unit
const pipeDropHeight = 20;
const pipeVertical = cylinder(pipeDropHeight, pipeRadius)
  .pointAlong([0, 0, -1])
  .translate(...indoorPipeExit)
  .translate(0, -3, 0)
  .color('#c4a066');

// Horizontal run through wall
const pipeHorizLength = wallThick + 30;
const pipeHorizontal = cylinder(pipeHorizLength, pipeRadius)
  .pointAlong([0, 1, 0])
  .translate(indoorPipeExit[0], indoorPipeExit[1] - 3, indoorPipeExit[2] - pipeDropHeight)
  .color('#c4a066');

// Vertical rise to outdoor unit
const pipeRiseHeight = outdoorHeight - 15;
const pipeRise = cylinder(pipeRiseHeight, pipeRadius)
  .pointAlong([0, 0, 1])
  .translate(outdoorPipeEntry[0], outdoorPipeEntry[1] - 3, outdoorPipeEntry[2] - pipeRiseHeight + 10)
  .color('#c4a066');

// Connection to outdoor unit
const pipeConnect = cylinder(15, pipeRadius)
  .pointAlong([0, -1, 0])
  .translate(outdoorPipeEntry[0], outdoorPipeEntry[1] + 5, outdoorPipeEntry[2] + 10)
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
  { name: "Pipe (vertical drop)", shape: pipeVertical },
  { name: "Pipe (through wall)", shape: pipeHorizontal },
  { name: "Pipe (rise)", shape: pipeRise },
  { name: "Pipe (connect)", shape: pipeConnect },
];
```

---

## Design Analysis

### Architecture Overview
This script demonstrates a **multi-component parametric assembly** with three distinct zones:
1. **Reference Wall** — The structural separator between indoor/outdoor spaces
2. **Indoor Unit** — Wall-mounted evaporator with aesthetic front panel
3. **Outdoor Unit** — Condenser with fan, heat exchanger fins, and mounting legs
4. **Refrigerant Lines** — Copper pipes connecting the units through the wall

### Key ForgeCAD Patterns Demonstrated

| Pattern | Usage | Benefit |
|---------|-------|---------|
| `param()` | All dimensions (widths, heights, depths, wall thickness) | Full configurability via UI sliders |
| `attachTo()` | Indoor unit → wall, outdoor unit → wall, all sub-components | Declarative positioning without coordinate math |
| `pointAlong()` | All pipe segments (vertical drop, horizontal run, rise) | Intuitive orientation without Euler angle confusion |
| `group()` | Vents array, fins array, legs pair | Preserves colors while treating multiple objects as one |
| Named object return | Array of `{name, shape}` objects | Individual visibility toggles and color controls in UI |

### Coordinate Strategy (Z-up Convention)

The script follows ForgeCAD's Z-up coordinate system:
- **X-axis**: Left/right positioning of units (indoor/outdoor alignment)
- **Y-axis**: Depth through the wall (front = −Y, back = +Y)
- **Z-axis**: Vertical height (gravity direction)


# User Feedback

Everything is all over the place, but you got some of the foundations.

```
npm run test-run examples/ac-unit-glm5.forge.js

> forgecad@0.1.0 test-run
> npx tsx cli/test-run.ts examples/ac-unit-glm5.forge.js

✓ Objects: 29
  Wall: vol=240000.0mm³  bbox=[-60.0,-10.0,-50.0] → [60.0,10.0,50.0]
  Indoor Body: vol=48000.0mm³  bbox=[-40.0,-40.0,0.0] → [40.0,-20.0,30.0]
  Front Panel: vol=3936.3mm³  bbox=[-38.0,-67.0,14.0] → [38.0,-41.0,16.0]
  Vents.1: vol=360.0mm³  bbox=[-30.0,-70.0,3.5] → [30.0,-68.0,6.5]
  Vents.2: vol=360.0mm³  bbox=[-30.0,-70.0,8.5] → [30.0,-68.0,11.5]
  Vents.3: vol=360.0mm³  bbox=[-30.0,-70.0,13.5] → [30.0,-68.0,16.5]
  Vents.4: vol=360.0mm³  bbox=[-30.0,-70.0,18.5] → [30.0,-68.0,21.5]
  Vents.5: vol=360.0mm³  bbox=[-30.0,-70.0,23.5] → [30.0,-68.0,26.5]
  Display: vol=90.0mm³  bbox=[12.5,-69.0,19.5] → [27.5,-68.0,25.5]
  LED: vol=13.3mm³  bbox=[18.5,-70.0,19.0] → [21.5,-67.0,22.0]
  Mounting Bracket: vol=1050.0mm³  bbox=[-35.0,-20.0,12.5] → [35.0,-17.0,17.5]
  Outdoor Body: vol=115500.0mm³  bbox=[-35.0,30.0,-37.5] → [35.0,60.0,17.5]
  Fan Housing: vol=29098.0mm³  bbox=[-36.8,-9.5,-13.3] → [1.8,29.0,11.7]
  Fan Blades: vol=2918.8mm³  bbox=[-35.1,-9.5,-2.3] → [0.1,25.7,0.7]
  Fan Grille: vol=327.8mm³  bbox=[-35.1,-9.5,-1.1] → [0.1,25.7,-0.6]
  Heat Fins.1: vol=562.5mm³  bbox=[6.8,5.0,-22.5] → [7.3,30.0,22.5]
  Heat Fins.2: vol=562.5mm³  bbox=[9.8,5.0,-22.5] → [10.3,30.0,22.5]
  Heat Fins.3: vol=562.5mm³  bbox=[12.8,5.0,-22.5] → [13.3,30.0,22.5]
  Heat Fins.4: vol=562.5mm³  bbox=[15.8,5.0,-22.5] → [16.3,30.0,22.5]
  Heat Fins.5: vol=562.5mm³  bbox=[18.8,5.0,-22.5] → [19.3,30.0,22.5]
  Heat Fins.6: vol=562.5mm³  bbox=[21.8,5.0,-22.5] → [22.3,30.0,22.5]
  Heat Fins.7: vol=562.5mm³  bbox=[24.8,5.0,-22.5] → [25.3,30.0,22.5]
  Heat Fins.8: vol=562.5mm³  bbox=[27.8,5.0,-22.5] → [28.3,30.0,22.5]
  Legs.1: vol=320.0mm³  bbox=[-29.0,51.0,-45.0] → [-21.0,59.0,-40.0]
  Legs.2: vol=320.0mm³  bbox=[21.0,51.0,-45.0] → [29.0,59.0,-40.0]
  Pipe (vertical drop): vol=1002.9mm³  bbox=[-30.7,-17.0,-30.0] → [-22.7,-9.0,-10.0]
  Pipe (through wall): vol=2507.2mm³  bbox=[-30.7,-13.0,-34.0] → [-22.7,37.0,-26.0]
  Pipe (rise): vol=2005.7mm³  bbox=[19.3,13.0,-47.5] → [27.3,21.0,-7.5]
  Pipe (connect): vol=752.1mm³  bbox=[19.3,10.0,-11.5] → [27.3,25.0,-3.5]
✓ Params: Wall Thickness, Indoor Width, Indoor Height, Indoor Depth, Outdoor Width, Outdoor Height, Outdoor Depth
✓ Time: 12ms
```

Things have the wrong orientations, dimensions, idk, it's a mess.

# V2

## Issues Identified from V1

Based on the test output and feedback:

1. **Indoor unit positioning**: Front panel is at Y ∈ [−67, −41], extending 47mm from wall (should be closer, wall-mounted)
2. **Outdoor unit positioning**: At Y ∈ [30, 60], but fan housing extends to Y=−9.5 (wrong side!)
3. **Pipe routing**: Vertical drop at Y ∈ [−17, −13], through wall at Y ∈ [−13, 37], but segments don't connect cleanly
4. **AttachTo misuse**: Some `attachTo` calls have wrong anchor syntax (e.g., `'front', 'back'` instead of proper face names)

## Key Patterns to Fix

From the API examples:
- `'front'` = −Y face, `'back'` = +Y face (in Z-up convention)
- `attachTo(parent, parentAnchor, selfAnchor, offset)` means "put my selfAnchor at parent's parentAnchor"
- Cylinders default to Z-up; use `pointAlong()` BEFORE translate/attachTo for horizontal runs
- For wall-mounted units: attach back face of unit to front/back of wall

---

## V2 - Corrected Implementation

```javascript
// Home AC Unit V2 - Fixed positioning and orientation

// Parameters
const wallThick = param("Wall Thickness", 20, { min: 10, max: 40, unit: "mm" });
const indoorWidth = param("Indoor Width", 80, { min: 60, max: 120, unit: "mm" });
const indoorHeight = param("Indoor Height", 30, { min: 20, max: 50, unit: "mm" });
const indoorDepth = param("Indoor Depth", 20, { min: 15, max: 35, unit: "mm" });
const outdoorWidth = param("Outdoor Width", 70, { min: 50, max: 100, unit: "mm" });
const outdoorHeight = param("Outdoor Height", 55, { min: 40, max: 80, unit: "mm" });
const outdoorDepth = param("Outdoor Depth", 30, { min: 20, max: 50, unit: "mm" });

// --- Wall (reference) ---
// Wall is centered on Y=0, so front is at Y=-wallThick/2, back is at Y=+wallThick/2
const wall = box(120, wallThick, 100, true).color('#d4c4a8');

// --- INDOOR UNIT (on FRONT of wall, -Y side, inside room) ---
// Indoor body hangs from front face of wall
const indoorBody = box(indoorWidth, indoorDepth, indoorHeight, true)
  .color('#f5f5f5')
  .attachTo(wall, 'front', 'back'); // Back of indoor unit flush with front of wall

// Front panel (aesthetic face toward the room)
const frontPanel = roundedRect(indoorWidth - 4, indoorHeight - 4, 3, true)
  .extrude(2)
  .color('#ffffff')
  .attachTo(indoorBody, 'front', 'back'); // Back of panel flush with front of body

// Air outlet vents (horizontal slats)
const ventCount = 5;
const ventSpacing = indoorHeight / (ventCount + 1);
const vents = [];
for (let i = 1; i <= ventCount; i++) {
  const z = -indoorHeight/2 + i * ventSpacing;
  const vent = box(indoorWidth - 20, 2, 3)
    .color('#333333')
    .attachTo(frontPanel, 'front', 'back', [0, -1, z]); // Offset in Z for vertical spacing
  vents.push(vent);
}

// Display panel on front
const display = box(15, 1, 6)
  .color('#1a1a2e')
  .attachTo(frontPanel, 'front', 'back', [indoorWidth/4, -1, indoorHeight/4]);

// LED indicator
const led = sphere(1.5).color('#00ff00')
  .attachTo(display, 'front', 'front', [0, -1, -2]);

// Mounting bracket (visible part on back of indoor unit)
const bracket = box(indoorWidth - 10, 3, 5)
  .color('#888888')
  .attachTo(indoorBody, 'back', 'front');

// --- OUTDOOR UNIT (on BACK of wall, +Y side, outside) ---
const outdoorBody = box(outdoorWidth, outdoorDepth, outdoorHeight, true)
  .color('#e8e8e8')
  .attachTo(wall, 'back', 'front'); // Front of outdoor unit flush with back of wall

// Big fan housing (circular, on front face of outdoor unit - facing the outside air)
const fanRadius = outdoorHeight * 0.35;
const fanHousing = cylinder(outdoorDepth - 5, fanRadius)
  .color('#555555')
  .attachTo(outdoorBody, 'front', 'back'); // Cylinder's back face at outdoor unit's front

// Fan blades
const fanBlade = cylinder(3, fanRadius - fanRadius * 0.1)
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

// Heat exchanger fins on side (vertical strips)
const finCount = 8;
const fins = [];
for (let i = 0; i < finCount; i++) {
  const fin = box(0.5, outdoorDepth - 5, outdoorHeight - 10, true)
    .color('#cc8844')
    .attachTo(outdoorBody, 'right', 'center', [outdoorWidth/2 - outdoorWidth*0.1 + i * 3, 0, 0]);
  fins.push(fin);
}

// Outdoor unit legs (brackets that attach to wall)
const legHeight = 8;
const leg1 = box(8, 8, legHeight).color('#444444')
  .attachTo(outdoorBody, 'bottom', 'top', [outdoorWidth/3, outdoorDepth/3, -legHeight/2]);
const leg2 = box(8, 8, legHeight).color('#444444')
  .attachTo(outdoorBody, 'bottom', 'top', [-outdoorWidth/3, outdoorDepth/3, -legHeight/2]);

// --- CONNECTING PIPES ---
const pipeRadius = 4;

// Calculate connection points
const indoorPipeExit = { 
  x: -indoorWidth/3, 
  y: -indoorDepth/2,  // Back of indoor unit (touching wall)
  z: -indoorHeight/2 + 5  // Near bottom
};

const outdoorPipeEntry = {
  x: outdoorWidth/3,
  y: outdoorDepth/2,   // Front of outdoor unit (touching wall)
  z: -outdoorHeight/2 + 10
};

// Pipe segment 1: Vertical drop from indoor unit (going down)
const dropHeight = 15;
const pipeVertical = cylinder(dropHeight, pipeRadius)
  .pointAlong([0, 0, -1])  // Pointing down
  .translate(indoorPipeExit.x, indoorPipeExit.y, indoorPipeExit.z)
  .color('#c4a066');

// Pipe segment 2: Horizontal run through wall (along Y axis)
const wallClearance = 5;
const pipeHorizLength = wallThick + indoorDepth + outdoorDepth + wallClearance;
const pipeHorizY = indoorPipeExit.y - dropHeight;
const pipeHorizontal = cylinder(pipeHorizLength, pipeRadius)
  .pointAlong([0, 1, 0])  // Pointing along +Y (from indoor to outdoor)
  .translate(indoorPipeExit.x, pipeHorizY - pipeHorizLength/2 + indoorDepth, indoorPipeExit.z - dropHeight)
  .color('#c4a066');

// Pipe segment 3: Vertical rise to outdoor unit
const riseHeight = outdoorHeight - 15;
const pipeRise = cylinder(riseHeight, pipeRadius)
  .pointAlong([0, 0, 1])  // Pointing up
  .translate(outdoorPipeEntry.x, outdoorPipeEntry.y - outdoorDepth/2, outdoorPipeEntry.z - riseHeight + 10)
  .color('#c4a066');

// Pipe segment 4: Connection into outdoor unit (short horizontal)
const pipeConnect = cylinder(15, pipeRadius)
  .pointAlong([0, -1, 0])  // Pointing toward outdoor unit
  .translate(outdoorPipeEntry.x, outdoorPipeEntry.y, outdoorPipeEntry.z + 10)
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
  { name: "Pipe (vertical drop)", shape: pipeVertical },
  { name: "Pipe (through wall)", shape: pipeHorizontal },
  { name: "Pipe (rise)", shape: pipeRise },
  { name: "Pipe (connect)", shape: pipeConnect },
];
```

---

## Key Corrections Made

### 1. Wall Positioning
- Wall is now explicitly centered on Y=0 using `box(120, wallThick, 100, true)`
- `'front'` anchor = Y = −wallThick/2 (indoor side)
- `'back'` anchor = Y = +wallThick/2 (outdoor side)

### 2. Indoor Unit
- Uses `attachTo(wall, 'front', 'back')` — back face of indoor unit flush with front face of wall
- No manual Y offset calculation needed
- Depth extends into the room (−Y direction)

### 3. Outdoor Unit  
- Uses `attachTo(wall, 'back', 'front')` — front face of outdoor unit flush with back face of wall
- Depth extends away from building (+Y direction)
- Fan housing properly oriented with `attachTo(outdoorBody, 'front', 'back')`

### 4. Pipe Routing
- Uses `pointAlong()` BEFORE translate for each segment
- Clear direction vectors: `[0, 0, -1]` for down, `[0, 1, 0]` for through wall, `[0, 0, 1]` for up
- Positions calculated from known connection points

### 5. Attachment Pattern
All child components now use consistent:
```javascript
child.attachTo(parent, 'parentFace', 'childFace', [xOff, yOff, zOff])
```

No more mixed manual translate + attachTo chains.

---

## Test Run Needed

Run this with:
```bash
npm run test-run examples/ac-unit-glm5.forge.js
```

Expected improvements:
- Indoor unit should be at Y ∈ [−wallThick/2 − indoorDepth, −wallThick/2]
- Outdoor unit should be at Y ∈ [+wallThick/2, +wallThick/2 + outdoorDepth]
- Fan housing should be fully on the outdoor side (Y > wallThick/2)
- Pipes should form a connected path without gaps

# User Feedback
It's less a mess, but still wrong angles, wrong rotations, wrong positions...

```
npm run test-run examples/ac-unit-glm5.forge.js

> forgecad@0.1.0 test-run
> npx tsx cli/test-run.ts examples/ac-unit-glm5.forge.js

✓ Objects: 29
  Wall: vol=240000.0mm³  bbox=[-60.0,-10.0,-50.0] → [60.0,10.0,50.0]
  Indoor Body: vol=48000.0mm³  bbox=[-40.0,-30.0,-15.0] → [40.0,-10.0,15.0]
  Front Panel: vol=3936.3mm³  bbox=[-38.0,-56.0,-1.0] → [38.0,-30.0,1.0]
  Vents.1: vol=360.0mm³  bbox=[-30.0,-59.0,-11.5] → [30.0,-57.0,-8.5]
  Vents.2: vol=360.0mm³  bbox=[-30.0,-59.0,-6.5] → [30.0,-57.0,-3.5]
  Vents.3: vol=360.0mm³  bbox=[-30.0,-59.0,-1.5] → [30.0,-57.0,1.5]
  Vents.4: vol=360.0mm³  bbox=[-30.0,-59.0,3.5] → [30.0,-57.0,6.5]
  Vents.5: vol=360.0mm³  bbox=[-30.0,-59.0,8.5] → [30.0,-57.0,11.5]
  Display: vol=90.0mm³  bbox=[12.5,-58.0,4.5] → [27.5,-57.0,10.5]
  LED: vol=13.3mm³  bbox=[18.5,-59.0,4.0] → [21.5,-56.0,7.0]
  Mounting Bracket: vol=1050.0mm³  bbox=[-35.0,-10.0,-2.5] → [35.0,-7.0,2.5]
  Outdoor Body: vol=115500.0mm³  bbox=[-35.0,10.0,-27.5] → [35.0,40.0,27.5]
  Fan Housing: vol=29098.0mm³  bbox=[-19.3,-28.5,-12.5] → [19.3,10.0,12.5]
  Fan Blades: vol=2828.3mm³  bbox=[-17.3,-28.5,-1.5] → [17.3,6.1,1.5]
  Fan Grille: vol=219.7mm³  bbox=[-17.3,-28.5,-0.3] → [17.3,6.2,0.3]
  Heat Fins.1: vol=562.5mm³  bbox=[62.8,12.5,-22.5] → [63.3,37.5,22.5]
  Heat Fins.2: vol=562.5mm³  bbox=[65.8,12.5,-22.5] → [66.3,37.5,22.5]
  Heat Fins.3: vol=562.5mm³  bbox=[68.8,12.5,-22.5] → [69.3,37.5,22.5]
  Heat Fins.4: vol=562.5mm³  bbox=[71.8,12.5,-22.5] → [72.3,37.5,22.5]
  Heat Fins.5: vol=562.5mm³  bbox=[74.8,12.5,-22.5] → [75.3,37.5,22.5]
  Heat Fins.6: vol=562.5mm³  bbox=[77.8,12.5,-22.5] → [78.3,37.5,22.5]
  Heat Fins.7: vol=562.5mm³  bbox=[80.8,12.5,-22.5] → [81.3,37.5,22.5]
  Heat Fins.8: vol=562.5mm³  bbox=[83.8,12.5,-22.5] → [84.3,37.5,22.5]
  Legs.1: vol=512.0mm³  bbox=[19.3,31.0,-39.5] → [27.3,39.0,-31.5]
  Legs.2: vol=512.0mm³  bbox=[-27.3,31.0,-39.5] → [-19.3,39.0,-31.5]
  Pipe (vertical drop): vol=752.1mm³  bbox=[-30.7,-14.0,-25.0] → [-22.7,-6.0,-10.0]
  Pipe (through wall): vol=3760.7mm³  bbox=[-30.7,-42.5,-29.0] → [-22.7,32.5,-21.0]
  Pipe (rise): vol=2005.7mm³  bbox=[19.3,-4.0,-47.5] → [27.3,4.0,-7.5]
  Pipe (connect): vol=752.1mm³  bbox=[19.3,0.0,-11.5] → [27.3,15.0,-3.5]
✓ Params: Wall Thickness, Indoor Width, Indoor Height, Indoor Depth, Outdoor Width, Outdoor Height, Outdoor Depth
✓ Time: 12ms
```

Last chance?

# V3

## Critical Issues in V2

Analyzing the bounding box output:

### Fan Housing Problem
```
Fan Housing: bbox=[-19.3,-28.5,-12.5] → [19.3,10.0,12.5]
```
- The fan housing extends from Y = -28.5 to Y = 10.0
- It should be entirely on the outdoor side (Y > 10)
- **Root cause**: `cylinder(outdoorDepth - 5, fanRadius)` creates a cylinder along Z-axis
- When we `attachTo(outdoorBody, 'front', 'back')`, we're attaching the cylinder's "back" face
- But a Z-up cylinder's "back" face is at Y = -radius, not Y = 0!
- The cylinder is oriented vertically (Z-up), so its faces are top/bottom/side, not front/back in the depth sense

### Solution: Use `pointAlong()` for cylinders

From the examples:
```javascript
// Correct: orient first, then position
const grille = cylinder(4, 30)
  .pointAlong([0, 1, 0])  // Point along Y axis
  .attachTo(outdoorUnit, 'back', 'front', [0, 2, 0]);
```

---

## V3 - Corrected with Proper Cylinder Orientation

```javascript
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
```

---

## Key Fixes in V3

### 1. Cylinder Orientation with `pointAlong()`
**Before (V2):**
```javascript
const fanHousing = cylinder(outdoorDepth - 5, fanRadius)
  .attachTo(outdoorBody, 'front', 'back');
// Wrong! Cylinder is Z-up, so "back" face is a point, not a face
```

**After (V3):**
```javascript
const fanHousing = cylinder(fanDepth, fanRadius)
  .pointAlong([0, 1, 0])  // Orient along Y first!
  .attachTo(outdoorBody, 'front', 'back');
// Now the cylinder's axis is along Y, so back/front faces make sense
```

### 2. Proper Face Semantics for Cylinders
A `cylinder(height, radius)` has:
- `top` face = +Z end (circular)
- `bottom` face = −Z end (circular)  
- `side` = curved surface

When you call `pointAlong([0, 1, 0])`, the cylinder rotates so:
- Its axis points along +Y
- `bottom` → becomes the −Y face (pointing toward wall)
- `top` → becomes the +Y face (pointing away from wall)
- After rotation, `attachTo(parent, 'front', 'bottom')` makes sense

### 3. Bounding Box for Pipe Routing
Using `boundingBox()` to get exact coordinates instead of manual calculations:
```javascript
const indoorBB = indoorBody.boundingBox();
const exitY = indoorBB.min[1]; // Exact back face position
```

### 4. Units Elevated from Center
Indoor and outdoor units are now raised above Z=0:
```javascript
.attachTo(wall, 'front', 'back', [0, 0, 20]) // Indoor raised 20mm
.attachTo(wall, 'back', 'front', [0, 0, 10]) // Outdoor raised 10mm
```

---

## Expected V3 Bounding Boxes

After these fixes:
- **Indoor Body**: Y ∈ [−10−indoorDepth, −10], Z centered at ~20mm
- **Outdoor Body**: Y ∈ [+10, +10+outdoorDepth], Z centered at ~10mm  
- **Fan Housing**: Y ∈ [outdoor unit front, outdoor unit front + fanDepth]
- **Pipes**: Continuous path connecting exit to entry

Test with:
```bash
npm run test-run examples/ac-unit-glm5.forge.js
```

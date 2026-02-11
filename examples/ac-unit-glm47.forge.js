// AC Unit Model
// Shows inside and outside units separated by a wall

// === Parameters ===
const wallThick = param("Wall Thickness", 200, { min: 100, max: 400, unit: "mm" });
const wallHeight = param("Wall Height", 2500, { min: 1500, max: 4000, unit: "mm" });
const wallWidth = param("Wall Width", 3000, { min: 1000, max: 5000, unit: "mm" });

// Inside Unit (Evaporator)
const inW = param("Inside Width", 800, { min: 400, max: 1200, unit: "mm" });
const inH = param("Inside Height", 300, { min: 200, max: 500, unit: "mm" });
const inD = param("Inside Depth", 250, { min: 150, max: 400, unit: "mm" });

// Outside Unit (Condenser)
const outW = param("Outside Width", 900, { min: 500, max: 1500, unit: "mm" });
const outH = param("Outside Height", 700, { min: 400, max: 1000, unit: "mm" });
const outD = param("Outside Depth", 400, { min: 200, max: 600, unit: "mm" });

// === Wall ===
// Create a wall with a hole for the pipes
const wall = box(wallWidth, wallThick, wallHeight, true);
const pipeHole = cylinder(wallThick + 10, 60).rotate(90, 0, 0);
const wallWithHole = wall.subtract(pipeHole);

// === Inside Unit ===
// Main housing
const insideBox = box(inW, inD, inH, true);

// Air vents (slats on the front facing the room)
const vents = [];
const ventCount = 8;
const ventPadZ = 20; // Padding from top/bottom
const ventSpacing = (inH - 2 * ventPadZ) / (ventCount - 1);

for (let i = 0; i < ventCount; i++) {
  // Centered box (true) ensures it aligns with the unit's center X
  vents.push(
    box(inW - 20, 2, 4, true)
      .translate(0, -inD / 2 - 1, -inH / 2 + ventPadZ + i * ventSpacing)
  );
}

// Control panel area (simple box on top right)
// Centered box, translated so its right edge aligns with the unit's right edge
const panelW = 100;
const panel = box(panelW, 10, 40, true)
  .translate(inW / 2 - panelW / 2, -inD / 2 - 5, inH / 2 - 20);

const insideUnit = union(insideBox, ...vents, panel)
  .translate(0, -wallThick / 2 - inD / 2, 0);

// === Outside Unit ===
// Main housing
const outsideBox = box(outW, outD, outH, true);

// Fan grill (grid of holes on the back)
const grillHoles = [];
const grillRows = 5;
const grillCols = 8;
const grillPadX = 40;
const grillPadZ = 40;
const grillStepX = (outW - 2 * grillPadX) / (grillCols - 1);
const grillStepZ = (outH - 2 * grillPadZ) / (grillRows - 1);

for (let r = 0; r < grillRows; r++) {
  for (let c = 0; c < grillCols; c++) {
    grillHoles.push(
      cylinder(10, 8).translate(
        -outW / 2 + grillPadX + c * grillStepX,
        outD / 2 + 1,
        -outH / 2 + grillPadZ + r * grillStepZ
      )
    );
  }
}

// Compressor bump (raised area on top)
// Centered box to align with unit
const compressorBump = box(outW * 0.6, outD * 0.6, 50, true)
  .translate(0, 0, outH / 2 - 25);

const outsideUnit = outsideBox
  .subtract(...grillHoles)
  .add(compressorBump)
  .translate(0, wallThick / 2 + outD / 2, 0);

// === Connecting Pipes ===
// Two pipes running through the wall connecting the units
// Length spans the wall thickness. Centered (true) so they bridge the gap exactly.
const pipeRadius = 15;
const pipeOffsetX = inW * 0.25; // Position pipes at 25% width
const pipeZ1 = -inH / 2 + inH * 0.2; // Lower pipe
const pipeZ2 = -inH / 2 + inH * 0.4; // Upper pipe

const pipe1 = cylinder(wallThick, pipeRadius, undefined, undefined, true)
  .rotate(90, 0, 0)
  .translate(-pipeOffsetX, 0, pipeZ1);
const pipe2 = cylinder(wallThick, pipeRadius, undefined, undefined, true)
  .rotate(90, 0, 0)
  .translate(pipeOffsetX, 0, pipeZ2);

// === Assembly ===
return [
  { name: "Wall", shape: wallWithHole.color("#CCCCCC") },
  { name: "Inside Unit", shape: insideUnit.color("#F0F0F0") },
  { name: "Outside Unit", shape: outsideUnit.color("#E0E0E0") },
  { name: "Pipes", shape: union(pipe1, pipe2).color("#333333") }
];

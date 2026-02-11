// 2D sketch basics — primitives, booleans, offset, then extrude to 3D.

const wall = param("Wall", 3, { min: 1, max: 8, unit: "mm" });
const height = param("Height", 30, { min: 10, max: 80, unit: "mm" });

// --- Sketch primitives ---
const r = rect(40, 30);
const c = circle2d(15).translate(20, 15);
const hex = ngon(6, 12).translate(70, 15);
const rounded = roundedRect(40, 30, 5).translate(100, 0);
const oblong = slot(40, 15).translate(0, -30);

// --- 2D booleans ---
// Subtract circle from rectangle → plate with hole
const plateSketch = rect(50, 40).subtract(circle2d(10).translate(25, 20));

// --- Offset: inflate/deflate contours ---
const outer = ngon(6, 20);
const inner = outer.offset(-wall);
const shellSketch = outer.subtract(inner); // hollow hexagon

// --- Extrude to 3D ---
const plate3d = plateSketch.extrude(height).translate(0, 60, 0).color('#4488cc');
const shell3d = shellSketch.extrude(height).translate(70, 60, 0).color('#cc8844');

// --- Path builder ---
const bracket = path()
  .moveTo(0, 0)
  .lineH(30)
  .lineV(40)
  .lineH(-10)
  .lineV(-30)
  .lineH(-20)
  .close()
  .extrude(5)
  .translate(130, 60, 0)
  .color('#44cc88');

return [
  { name: "Rect", sketch: r },
  { name: "Circle", sketch: c },
  { name: "Hexagon", sketch: hex },
  { name: "Rounded Rect", sketch: rounded },
  { name: "Slot", sketch: oblong },
  { name: "Plate (extruded)", shape: plate3d },
  { name: "Shell (offset + extrude)", shape: shell3d },
  { name: "Bracket (path + extrude)", shape: bracket },
];

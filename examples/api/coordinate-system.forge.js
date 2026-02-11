// Coordinate system — ForgeCAD uses Z-up, right-handed.
//   X = right (+X), left (-X)
//   Y = forward (+Y), back (-Y)
//   Z = up (+Z), down (-Z)
//
// "front" = -Y face (camera default looks from -Y toward +Y)
// "back"  = +Y face

const axisLen = 80;
const shaftR = 2;
const tipH = 10;
const tipR = 5;

// X axis — red, pointing right
const xShaft = cylinder(axisLen, shaftR).pointAlong([1, 0, 0]).color('#cc4444');
const xTip = cylinder(tipH, tipR, 0).pointAlong([1, 0, 0]).translate(axisLen, 0, 0).color('#cc4444');
const xMark = sphere(4).translate(axisLen + tipH + 5, 0, 0).color('#cc4444');

// Y axis — green, pointing forward
const yShaft = cylinder(axisLen, shaftR).pointAlong([0, 1, 0]).color('#44cc44');
const yTip = cylinder(tipH, tipR, 0).pointAlong([0, 1, 0]).translate(0, axisLen, 0).color('#44cc44');
const yMark = box(7, 7, 7, true).translate(0, axisLen + tipH + 5, 0).color('#44cc44');

// Z axis — blue, pointing up
const zShaft = cylinder(axisLen, shaftR).color('#4444cc');
const zTip = cylinder(tipH, tipR, 0).translate(0, 0, axisLen).color('#4444cc');
const zMark = cylinder(4, 4, 4, 6).translate(0, 0, axisLen + tipH + 5).color('#4444cc');

// Origin
const origin = sphere(3).color('#ffffff');

// Reference box to show face names
const ref = box(30, 20, 15, true).translate(40, 40, 0).color('#888888');
// "front" face is at -Y, "right" face is at +X, "top" face is at +Z
const frontDot = sphere(3).color('#ffaa00')
  .attachTo(ref, 'front', 'center', [0, -5, 0]);
const topDot = sphere(3).color('#ffaa00')
  .attachTo(ref, 'top', 'center', [0, 0, 5]);

return [
  { name: "X shaft (right)", shape: xShaft },
  { name: "X tip", shape: xTip },
  { name: "X mark ●", shape: xMark },
  { name: "Y shaft (forward)", shape: yShaft },
  { name: "Y tip", shape: yTip },
  { name: "Y mark ■", shape: yMark },
  { name: "Z shaft (up)", shape: zShaft },
  { name: "Z tip", shape: zTip },
  { name: "Z mark ⬡", shape: zMark },
  { name: "Origin", shape: origin },
  { name: "Reference Box", shape: ref },
  { name: "Front dot (−Y)", shape: frontDot },
  { name: "Top dot (+Z)", shape: topDot },
];

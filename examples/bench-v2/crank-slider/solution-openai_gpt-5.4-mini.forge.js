const R = 20;
const rodLen = 60;
const rodThk = 8;
const rodWid = 14;

const base = union(
  box(120, 50, 12, true).translate(20, 0, 0),
  box(30, 80, 80, true).translate(-40, 0, 34),
  box(16, 16, 80, true).translate(10, 0, 34)
);

const crank = union(
  cylinder(8, 8, 8, 48, true),
  box(R, 10, 8, true).translate(R / 2, 0, 0),
  cylinder(8, 4, 4, 32, true).translate(R, 0, 0)
).translate(0, 0, 0);

const rod = box(rodLen, rodWid, rodThk, true)
  .translate(0, 0, 0)
  .rotate(0, 0, 0);

const slider = union(
  box(26, 34, 18, true),
  cylinder(18, 5, 5, 32, true).translate(10, 0, 0)
).translate(0, 0, 0);

const a = assembly("CrankSlider");
a.addPart("Base", base, { fixed: true });
a.addPart("Crank", crank);
a.addPart("Rod", rod);
a.addPart("Slider", slider);

a.addRevolute("drive", "Base", "Crank", {
  axis: [0, 0, 1],
  min: 0,
  max: 360,
  default: 0,
  frame: Transform.identity().translate(0, 0, 40)
});

a.addRevolute("wrist", "Crank", "Rod", {
  axis: [0, 0, 1],
  min: -180,
  max: 180,
  default: 0,
  frame: Transform.identity().translate(R, 0, 40)
});

a.addPrismatic("slide", "Base", "Slider", {
  axis: [1, 0, 0],
  min: -20,
  max: 20,
  default: 0,
  frame: Transform.identity().translate(20, 0, 40)
});

return a;
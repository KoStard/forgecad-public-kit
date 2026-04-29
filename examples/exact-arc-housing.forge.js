// Bearing housing with exact circular arc (not polyline-approximated)
const profile = path()
  .moveTo(0, 0)
  .lineTo(50, 0)
  .lineTo(50, 10)
  .exactArcTo(40, 20, { radius: 10 })
  .lineTo(0, 20)
  .close();

const housing = profile.extrude(30);
const bore = cylinder(30, 8).translate(25, 10, 0);
return difference(housing, bore);

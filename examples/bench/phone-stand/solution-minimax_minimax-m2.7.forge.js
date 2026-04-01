// Base: flat rectangular plate
const base = box(100, 80, 10)
  .translate(0, 0, 0)
  .color("#666666");

// Support: angled plate + top lip
const plate = box(60, 5, 90)
  .translate(0, 0, 10)
  .rotate(65, 0, 0);

const lip = box(60, 5, 10)
  .translate(0, 0, 85);

const support = union(plate, lip)
  .color("#2196F3");

// Assembly with fixed joint
const a = assembly("PhoneStand")
  .addPart("Base", base)
  .addPart("Support", support)
  .addFixed("mount", "Base", "Support", {
    axis: [1, 0, 0],
    frame: Transform.identity().translate(0, -40, 10)
  });

return a.solve();
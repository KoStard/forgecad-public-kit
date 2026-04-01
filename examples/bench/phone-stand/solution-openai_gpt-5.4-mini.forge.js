const Base = union(
  box(120, 75, 8, true).translate(0, 0, 4),
  box(60, 55, 16, true).translate(0, -10, 12)
);

const supportPlate = box(6, 70, 95, true)
  .rotate(0, -20, 0)
  .translate(8, -8, 56);

const lip = box(8, 72, 10, true)
  .rotate(0, -20, 0)
  .translate(25, -8, 104);

const Support = union(
  supportPlate,
  lip,
  box(24, 26, 18, true).translate(10, -8, 18)
);

const stand = assembly("PhoneStand")
  .addPart("Base", Base)
  .addPart("Support", Support)
  .addFixed("mount", "Base", "Support", {
    frame: Transform.identity().translate(0, 0, 0)
  });

return stand;
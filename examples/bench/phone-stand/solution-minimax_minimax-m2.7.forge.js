// Phone Stand Assembly

// Base: flat bottom piece, wider than tall (landscape), sits on table (Z_min ≈ 0)
const base = box(120, 80, 12, false)
  .translate(0, 0, 0);

// Support: angled piece that holds the phone
// 100mm wide, 80mm long, 6mm thick
// Center positioned above base, rotated 20° to lean backward
const support = box(100, 80, 6, false)
  .translate(0, 40, 50)
  .rotate(0, 0, 20);

// Create assembly with base and support
const phoneStand = assembly("PhoneStand")
  .addPart("Base", base)
  .addPart("Support", support)
  .addFixed("mount", "Base", "Support", {
    frame: Transform.identity().translate(0, 40, 6)
  });

return phoneStand;
// Base: flat bottom piece (landscape orientation for stability)
const base = box(120, 80, 10, true)
  .translate(0, 0, 5)
  .color("#4a4a4a");

// Support: angled piece holding the phone
// Positioned at back of base, tilted 70 degrees
// Dimensions: 100 wide, 8 thick, 80 tall
// When rotated 70°, reaches well above 70mm height requirement
const support = box(100, 8, 80, true)
  .translate(0, 40, 50)
  .rotate(0, 70, 0)
  .color("#6b6b6b");

// Create assembly with fixed mount joint
return assembly("PhoneStand")
  .addPart("Base", base)
  .addPart("Support", support)
  .addFixed("mount", "Base", "Support", {
    frame: Transform.identity().translate(0, 40, 10)
  });
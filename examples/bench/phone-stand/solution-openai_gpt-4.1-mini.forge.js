const baseWidth = 150;
const baseDepth = 100;
const baseHeight = 10;

const supportWidth = 10;
const supportDepth = 100;
const supportHeight = 80;
const supportAngle = 60; // degrees from horizontal

// Base: flat box centered on XY, bottom at Z=0
const base = box(baseWidth, baseDepth, baseHeight, true)
  .translate(0, 0, baseHeight / 2)
  .color("#888888");

// Support: tall box, rotated and positioned on base
let support = box(supportWidth, supportDepth, supportHeight, true)
  // Rotate around X axis to angle it backward
  .rotate(-supportAngle, 0, 0);

// Position support so bottom edge sits on base top surface, centered in Y and X offset
// Calculate vertical offset so bottom of support touches base top (Z=baseHeight)
const supportBottomZ = -supportHeight / 2;
const supportTopZ = supportHeight / 2;
const supportOffsetZ = baseHeight - supportBottomZ; // move support up so bottom at baseHeight

// Move support forward in Y so phone can rest on it (half base depth minus half support depth)
const supportOffsetY = 0;

support = support.translate(0, supportOffsetY, supportOffsetZ)
  .color("#4444cc");

// Create assembly and add parts
const assembly = assembly("PhoneStand")
  .addPart("Base", base)
  .addPart("Support", support)
  .addFixed("mount", "Base", "Support");

return assembly;
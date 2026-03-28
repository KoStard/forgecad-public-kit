// Expert solution: Phone stand
// Base flat on Z=0, support touching base top and angled back

const baseW = 120;
const baseD = 80;
const baseH = 8;
const supportW = 100;
const supportT = 6;
const supportH = 90;
const angle = 15;

const base = box(baseW, baseD, baseH, true).translate(0, 0, baseH / 2).color("#555");

// Support: bottom edge at Z=baseH (touching base top), lean back along Y
// Build upright from Z=0, then rotate, then shift up to baseH
const support = box(supportW, supportT, supportH)
  .translate(-supportW / 2, -supportT / 2, 0) // center XY, bottom at Z=0
  .rotate(-angle, 0, 0)                         // lean back — bottom stays near Z=0
  .translate(0, -baseD / 4, baseH - 1)          // bottom touches base top (overlap 1mm for contact)
  .color("#4488aa");

return assembly("Phone Stand")
  .addPart("Base", base)
  .addPart("Support", support)
  .addFixed("mount", "Base", "Support");

const baseWidth = 120;
const baseDepth = 80;
const baseHeight = 15;

const supportWidth = 80;
const supportDepth = 12;
const supportHeight = 100;
const supportAngle = 20;

const base = box(baseWidth, baseDepth, baseHeight, false)
  .color("#2c3e50");

const support = box(supportWidth, supportDepth, supportHeight, false)
  .rotate(supportAngle, 0, 0)
  .translate(0, -baseDepth/2 + supportDepth/2, baseHeight)
  .color("#34495e");

const phoneStand = assembly("PhoneStand")
  .addPart("Base", base)
  .addPart("Support", support)
  .addFixed("mount", "Base", "Support", {
    frame: Transform.identity()
  });

return phoneStand.solve();
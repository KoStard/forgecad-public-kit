// Headphone Hanger — stroke approach
// Draw centerline, thicken it. Done.

const plateW = param("Plate Width", 50, { min: 30, max: 80, unit: "mm" });
const t = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const armLen = param("Arm Length", 70, { min: 40, max: 120, unit: "mm" });
const hookLen = param("Hook Length", 20, { min: 10, max: 40, unit: "mm" });
const hookAngle = param("Hook Angle", 35, { min: 15, max: 60, unit: "°" });

return path()
  .moveTo(0, 0)
  .lineH(plateW)
  .lineV(-armLen)
  .lineAngled(hookLen, 270 - hookAngle)
  .stroke(t);

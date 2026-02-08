// Headphone Hanger - Path Builder
// Trace outer edge clockwise, then inner edge back

const plateW = param("Plate Width", 50, { min: 30, max: 80, unit: "mm" });
const t = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const armLen = param("Arm Length", 70, { min: 40, max: 120, unit: "mm" });
const hookLen = param("Hook Length", 20, { min: 10, max: 40, unit: "mm" });
const hookAngle = param("Hook Angle", 35, { min: 15, max: 60, unit: "°" });

const hookDir = 270 - hookAngle;   // outer edge direction (down-left)
const hookPerp = hookDir - 90;     // across hook tip (inward)

return path()
  .moveTo(0, 0)
  .lineH(plateW)                        // plate top →
  .lineV(-t)                            // plate right ↓
  .lineH(-(plateW - t))                 // plate bottom ←
  .lineV(-armLen)                       // arm outer ↓
  .lineAngled(hookLen, hookDir)         // hook outer ↙
  .lineAngled(t, hookPerp)             // hook tip
  .lineAngled(hookLen, hookDir + 180)  // hook inner ↗
  .lineTo(0, -t - armLen)               // arm inner bottom
  .lineTo(0, -t)                        // arm inner top
  .close();

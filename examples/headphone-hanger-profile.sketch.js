// Headphone Hanger - Side Profile Sketch
// Flat mounting plate on top (glue surface), arm drops down, hook curls inward
// All Y-positive = upward. Plate at top, arm goes down (negative Y), hook curls inward.
// Manifold CrossSection needs CCW winding.

const plateW = param("Plate Width", 50, { min: 30, max: 80, unit: "mm" });
const t = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const armLen = param("Arm Length", 70, { min: 40, max: 120, unit: "mm" });
const hookLen = param("Hook Length", 20, { min: 10, max: 40, unit: "mm" });
const hookAngle = param("Hook Angle", 35, { min: 15, max: 60, unit: "°" });

const rad = hookAngle * Math.PI / 180;
const hx = Math.sin(rad) * hookLen;
const hy = Math.cos(rad) * hookLen;

// CCW winding, starting top-left, going left-edge down first
// Plate top = y=0, arm goes into negative y
const profile = polygon([
  [0, 0],                              // top-left (glue surface)
  [0, -armLen],                         // arm bottom-outer
  [hx, -(armLen + hy)],                 // hook tip outer
  [t + hx, -(t + armLen + hy)],         // hook tip inner
  [t, -(t + armLen)],                   // arm bottom-inner
  [t, -t],                              // arm top-inner
  [plateW, -t],                         // plate bottom-right
  [plateW, 0],                          // top-right
]);

return profile;

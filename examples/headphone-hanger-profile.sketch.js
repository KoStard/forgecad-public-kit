// Headphone Hanger - attachTo + rotateAround
// Three rectangles positioned declaratively

const plateW = param("Plate Width", 50, { min: 30, max: 80, unit: "mm" });
const t = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const armLen = param("Arm Length", 70, { min: 40, max: 120, unit: "mm" });
const hookLen = param("Hook Length", 20, { min: 10, max: 40, unit: "mm" });
const hookAngle = param("Hook Angle", 35, { min: 15, max: 60, unit: "°" });

const plate = rect(plateW, t);
const arm = rect(t, armLen).attachTo(plate, 'bottom-left', 'top-left');

// Attach hook then rotate around attachment point
const armBottom = [0, -armLen - t];
const hook = rect(t, hookLen)
  .attachTo(arm, 'bottom-left', 'top-left')
  .rotateAround(-hookAngle, armBottom);

return union2d(plate, arm, hook);

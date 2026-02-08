// Headphone Hanger - 3D Part

const depth = param("Depth", 30, { min: 15, max: 50, unit: "mm" });
const plateW = param("Plate Width", 50, { min: 30, max: 80, unit: "mm" });
const t = param("Thickness", 4, { min: 2, max: 8, unit: "mm" });
const armLen = param("Arm Length", 70, { min: 40, max: 120, unit: "mm" });
const hookLen = param("Hook Length", 20, { min: 10, max: 40, unit: "mm" });
const hookAngle = param("Hook Angle", 35, { min: 15, max: 60, unit: "°" });
const holeD = param("Screw Hole Dia", 4, { min: 0, max: 6, step: 0.5, unit: "mm" });

// Build profile with attachTo
const plate = rect(plateW, t);
const arm = rect(t, armLen).attachTo(plate, 'bottom-left', 'top-left');
const armBottom = [0, -armLen - t];
const hook = rect(t, hookLen)
  .attachTo(arm, 'bottom-left', 'top-left')
  .rotateAround(-hookAngle, armBottom);

const profile = union2d(plate, arm, hook);
const rounded = profile.offset(-1, 'Round').offset(1, 'Round');
let hanger = rounded.extrude(depth);

// Optional screw holes
if (holeD > 0) {
  const hole = cylinder(t + 2, holeD / 2);
  const h1 = hole.translate(plateW * 0.3, -1, depth / 3);
  const h2 = hole.translate(plateW * 0.3, -1, depth * 2 / 3);
  hanger = hanger.subtract(h1).subtract(h2);
}

return hanger;

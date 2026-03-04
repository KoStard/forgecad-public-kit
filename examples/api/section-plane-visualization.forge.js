// Section Plane Visualization — renderer-side guides for active cut planes.
//
// How to use:
// 1) Toggle planes in View Panel -> Cut Planes
// 2) Adjust View Panel -> Section Visuals (fill, border, normal axis)
// 3) "Probe" is excluded from both cuts, so it stays intact for alignment checks.
//
// No helper solids are needed in your model. Guides are viewport-only overlays.

const width = param("Width", 120, { min: 80, max: 180, unit: "mm" });
const depth = param("Depth", 80, { min: 50, max: 140, unit: "mm" });
const height = param("Height", 70, { min: 40, max: 120, unit: "mm" });
const wall = param("Wall", 8, { min: 3, max: 16, unit: "mm" });

const cutX = param("Cut X", 0, { min: -80, max: 80, unit: "mm" });
const cutZ = param("Cut Z", 10, { min: -30, max: 80, unit: "mm" });

cutPlane("Internal X", [1, 0, 0], cutX, { exclude: "Probe" });
cutPlane("Internal Z", [0, 0, 1], cutZ, { exclude: "Probe" });

const shell = box(width, depth, height, true);
const cavity = box(width - wall * 2, depth - wall * 2, height - wall * 1.6, true).translate(0, 0, wall * 0.2);
const passX = cylinder(width + 8, Math.min(depth, height) * 0.12, undefined, 48, true).rotate(0, 90, 0);
const passY = cylinder(depth + 8, Math.min(width, height) * 0.09, undefined, 48, true).rotate(90, 0, 0).translate(0, 0, 12);
const probe = cylinder(height + 20, 2.5, undefined, 36, true)
  .translate(width * 0.22, depth * 0.18, 0)
  .color("#f3a847");

const housing = shell
  .subtract(cavity)
  .subtract(passX)
  .subtract(passY)
  .color("#8aa7c8");

return [
  { name: "Housing", shape: housing },
  { name: "Probe", shape: probe },
];

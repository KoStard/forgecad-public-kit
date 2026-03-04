// Cut Plane Demo — toggle section views in the View Panel
//
// cutPlane(name, normal, offsetOrOptions?, options?)
//   normal: direction pointing toward the side that gets removed
//   offset: distance from origin along the normal where the cut happens
//   exclude: object name(s) to keep uncut for this plane

const size = param("Size", 60, { min: 20, max: 120, unit: "mm" });
const holeR = param("Hole Radius", 12, { min: 4, max: 25, unit: "mm" });
const cutZ = param("Cut Z", 10, { min: -60, max: 60, unit: "mm" });
const cutY = param("Cut Y", 0, { min: -60, max: 60, unit: "mm" });

// Define cut planes — they appear as toggles in the View Panel
cutPlane("Horizontal Section", [0, 0, 1], cutZ, { exclude: "Probe" }); // removes top half except Probe
cutPlane("Front Section", [0, -1, 0], cutY, { exclude: "Probe" });      // removes front half except Probe

// Build a box with a cylindrical hole
const body = box(size, size, size, true);
const hole = cylinder(size + 2, holeR, holeR, 32, true);
const part = body.subtract(hole).color("#8aa7c8");
const probe = cylinder(size + 14, Math.max(2, holeR * 0.22), undefined, 32, true)
  .translate(size * 0.3, size * 0.18, 0)
  .color("#efaa6d");

return [
  { name: "Body", shape: part },
  { name: "Probe", shape: probe },
];

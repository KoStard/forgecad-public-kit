// Cut Plane Demo — toggle section views in the View Panel
//
// cutPlane(name, normal, offset)
//   normal: direction pointing toward the side that gets removed
//   offset: distance from origin along the normal where the cut happens

const size = param("Size", 60, { min: 20, max: 120, unit: "mm" });
const holeR = param("Hole Radius", 12, { min: 4, max: 25, unit: "mm" });
const cutZ = param("Cut Z", 10, { min: -60, max: 60, unit: "mm" });
const cutY = param("Cut Y", 0, { min: -60, max: 60, unit: "mm" });

// Define cut planes — they appear as toggles in the View Panel
cutPlane("Horizontal Section", [0, 0, 1], cutZ);   // removes top half
cutPlane("Front Section", [0, -1, 0], cutY);        // removes front half

// Build a box with a cylindrical hole
const body = box(size, size, size, true);
const hole = cylinder(size + 2, holeR, holeR, 32, true);
const part = body.subtract(hole);

return part;

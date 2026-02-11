// Visualize bounding boxes — useful for debugging positioning.
//
// boundingBox() returns { min: [x,y,z], max: [x,y,z] }.
// This example draws thin cylinders along the 12 edges of the bbox.

const edgeR = 0.5; // wireframe edge radius

function vizBBox(shape) {
  const bb = shape.boundingBox();
  const [x0, y0, z0] = bb.min;
  const [x1, y1, z1] = bb.max;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;

  const edges = [];
  // 4 edges along X (at each combination of Y,Z corners)
  for (const y of [y0, y1]) {
    for (const z of [z0, z1]) {
      edges.push(cylinder(dx, edgeR).pointAlong([1, 0, 0]).translate(x0, y, z));
    }
  }
  // 4 edges along Y
  for (const x of [x0, x1]) {
    for (const z of [z0, z1]) {
      edges.push(cylinder(dy, edgeR).pointAlong([0, 1, 0]).translate(x, y0, z));
    }
  }
  // 4 edges along Z
  for (const x of [x0, x1]) {
    for (const y of [y0, y1]) {
      edges.push(cylinder(dz, edgeR).translate(x, y, z0));
    }
  }
  return union(...edges);
}

// --- Demo shapes ---

// A rotated box — bbox is larger than the shape itself
const angle = param("Rotation", 30, { min: 0, max: 90, unit: "°" });
const rotBox = box(40, 30, 20, true).rotate(0, 0, angle).color('#4488cc');
const rotBBox = vizBBox(rotBox).color('#cc4444');

// A sphere — bbox is a perfect cube around it
const sph = sphere(20).translate(80, 0, 0).color('#44cc44');
const sphBBox = vizBBox(sph).color('#cc4444');

// A tilted cylinder — bbox shows the extent
const tiltCyl = cylinder(50, 10).rotate(30, 0, 0).translate(0, 80, 0).color('#cc88ff');
const cylBBox = vizBBox(tiltCyl).color('#cc4444');

return [
  { name: "Rotated Box", shape: rotBox },
  { name: "Box BBox", shape: rotBBox },
  { name: "Sphere", shape: sph },
  { name: "Sphere BBox", shape: sphBBox },
  { name: "Tilted Cylinder", shape: tiltCyl },
  { name: "Cylinder BBox", shape: cylBBox },
];

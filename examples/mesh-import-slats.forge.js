// Mesh Import: Slat-Cut Sculpture
//
// Imports an external STL mesh and intersects it with a parametric
// slat pattern to create a layered sculpture effect.

const slatCount = param("Slat count", 16, { min: 4, max: 40 });
const slatThickness = param("Slat thickness", 1.2, { min: 0.4, max: 3, unit: "mm" });
const gap = param("Gap", 1.5, { min: 0.5, max: 5, unit: "mm" });

// Import an external mesh file
const mesh = importMesh("assets/sphere.stl");
const bb = mesh.boundingBox();
const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
const center = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];

// Build slat pattern: evenly spaced thin boxes along Y axis
const pitch = slatThickness + gap;
const slats = [];
for (let i = 0; i < slatCount; i++) {
  const y = center[1] - (slatCount - 1) * pitch / 2 + i * pitch;
  slats.push(
    box(size[0] + 10, slatThickness, size[2] + 10, true)
      .translate(center[0], y, center[2])
  );
}
const slatBlock = union(...slats);

// Intersect: keep only the parts of the mesh inside the slats
const carved = intersection(mesh, slatBlock).color("#cc3333");

return carved;

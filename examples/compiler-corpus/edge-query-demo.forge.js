// Edge Query API Demo — selecting and filleting edges on arbitrary shapes
//
// Demonstrates selectEdge(), selectEdges(), and filletEdgeSegment()
// on shapes built from booleans (not just box().edge('vert-bl')).

// --- Simple: fillet a boolean result ---
const base = box(40, 30, 20);
const notch = box(10, 10, 25).translate(15, 10, -2);
const part = difference(base, notch);

// Select vertical edges near the front-left corner
const edge1 = selectEdge(part, {
  parallel: [0, 0, 1],
  near: [0, 0, 10],
  convex: true,
});

const filleted = filletEdgeSegment(part, edge1, 3);

// --- Multiple edges: chamfer all top-facing convex edges ---
const block = box(30, 30, 15, true);
const cyl = cylinder(20, 8, 8, 32, true);
const combined = union(block, cyl);

// Find all vertical edges — these are the sharp corners from the boolean
const vertEdges = selectEdges(combined, {
  parallel: [0, 0, 1],
  convex: true,
  minLength: 5,
});

// Chamfer each one
let chamfered = combined;
for (const e of vertEdges) {
  try {
    chamfered = chamferEdgeSegment(chamfered, e, 1.5);
  } catch (_) {
    // Some edges may fail after previous chamfers change the mesh
  }
}

// --- Coalescing: merge tessellation fragments on a cylinder ---
const pipe = cylinder(30, 10, 10, 16); // 16-sided approximation
const allVertical = selectEdges(pipe, { parallel: [0, 0, 1] });
const coalesced = coalesceEdges(allVertical);
// coalesced should have 16 edges (one per polygon face boundary)

return [
  { name: 'Filleted Boolean', shape: filleted.translate(-50, 0, 0) },
  { name: 'Chamfered Union', shape: chamfered },
  { name: `Pipe (${coalesced.length} edges)`, shape: pipe.translate(50, 0, 0) },
];

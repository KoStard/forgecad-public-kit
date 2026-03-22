// Transition Curves — smooth connections between edges
// Demonstrates transitionCurve(), transitionSurface(), pickEdgeSegment(),
// connectEdges(), and weighted blending (G1 + G2 continuity).

const weight = param("Weight A", 1.0, { min: 0.1, max: 5.0, step: 0.1 });
const weightB = param("Weight B", 1.0, { min: 0.1, max: 5.0, step: 0.1 });
const radius = param("Tube Radius", 1.5, { min: 0.3, max: 5, unit: "mm" });

// ── 1. Line-to-line transition (L-shaped pipe) ─────────────────────
const lineToLine = transitionSurface(
  { point: [0, 0, 0], tangent: [1, 0, 0] },
  { point: [30, 20, 0], tangent: [0, 1, 0] },
  { radius, weightA: weight, weightB: weightB },
);

// ── 2. S-curve (opposing tangents) ──────────────────────────────────
const sCurve = transitionSurface(
  { point: [0, 0, 15], tangent: [1, 0, 0] },
  { point: [30, 20, 15], tangent: [-1, 0, 0] },
  { radius, weightA: weight, weightB: weightB },
);

// ── 3. 3D transition (going up and around) ──────────────────────────
const transition3D = transitionSurface(
  { point: [0, 0, 35], tangent: [1, 0, 0] },
  { point: [25, 15, 50], tangent: [0, 0, 1] },
  { radius, weightA: weight, weightB: weightB, up: [0, 1, 0] },
);

// ── 4. Asymmetric weight (3:0.5) ────────────────────────────────────
const weighted = transitionSurface(
  { point: [50, 0, 0], tangent: [1, 0, 0] },
  { point: [80, 20, 0], tangent: [0, 1, 0] },
  { radius, weightA: 3.0, weightB: 0.5 },
);

// ── 5. Edge selection UX: connect edges of real shapes ──────────────
// Create two boxes and connect their edges using selectEdge + pickEdgeSegment
const boxA = box(10, 10, 10).translate(-5, -5, -5);
const boxB = box(10, 10, 10).translate(35, 15, 10);

// Select a top edge from box A (at Z=5) and a bottom edge from box B (at Z=10)
const topEdgeA = selectEdge(boxA, { atZ: 5, parallel: [1, 0, 0] });
const bottomEdgeB = selectEdge(boxB, { atZ: 10, parallel: [1, 0, 0] });

// Pick connection points with tangent pointing outward from surface
const pickA = pickEdgeSegment(topEdgeA, { end: 'mid', tangentMode: 'outward' });
const pickB = pickEdgeSegment(bottomEdgeB, { end: 'mid', tangentMode: 'outward' });

const edgeConnector = transitionSurface(pickA, pickB, {
  radius: 2,
  weightA: weight,
  weightB: weightB,
});

// ── 6. connectEdges shortcut (one-liner) ────────────────────────────
// Same workflow as #5 but using the convenience function
const sideEdgeA = selectEdge(boxA, { near: [5, 0, 0], parallel: [0, 0, 1] });
const sideEdgeB = selectEdge(boxB, { near: [30, 15, 15], parallel: [0, 0, 1] });

const shortcutConnector = connectEdges(sideEdgeA, sideEdgeB, {
  endA: 'mid',
  endB: 'mid',
  tangentModeA: 'outward',
  tangentModeB: 'outward',
  radius: 1.5,
  weightA: weight,
  weightB: weightB,
});

// ── 7. Curved edge: cylinder-to-box transition ─────────────────────
// Connect the top of a cylinder to a box using explicit tangents
// (Curved mesh edges have many small segments, so manual tangent is cleaner)
const cyl = cylinder(8, 25).translate(0, -30, 0);
const box2 = box(12, 12, 12).translate(25, -30, 20);

const cylToBox = transitionSurface(
  { point: [8, -30, 25], tangent: [1, 0, 0.3], normal: [0, 0, 1] },
  { point: [19, -30, 20], tangent: [-1, 0, 0], normal: [0, 0, -1] },
  { radius: 1.5, weightA: weight, weightB: weightB },
);

return [
  { name: "L-bend", shape: lineToLine.color('#4a90d9') },
  { name: "S-curve", shape: sCurve.color('#d94a4a') },
  { name: "3D transition", shape: transition3D.color('#4ad97a') },
  { name: "Weighted (3:0.5)", shape: weighted.color('#d9a64a') },
  { name: "Box A", shape: boxA.color('#888888') },
  { name: "Box B", shape: boxB.color('#888888') },
  { name: "Edge Connector", shape: edgeConnector.color('#4ad9d9') },
  { name: "Shortcut Connector", shape: shortcutConnector.color('#d94ad9') },
  { name: "Cylinder", shape: cyl.color('#aaaaaa') },
  { name: "Box 2", shape: box2.color('#aaaaaa') },
  { name: "Cyl-to-Box", shape: cylToBox.color('#d9d94a') },
];

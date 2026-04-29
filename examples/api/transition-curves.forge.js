// Transition Curves — smooth connections between edges
// Demonstrates transitionCurve(), transitionSurface(), connectEdges(),
// and weighted blending (G1 + G2 continuity).

const weight = Param.number("Weight A", 1.0, { min: 0.1, max: 5.0, step: 0.1 });
const weightB = Param.number("Weight B", 1.0, { min: 0.1, max: 5.0, step: 0.1 });
const radius = Param.number("Tube Radius", 1.5, { min: 0.3, max: 5, unit: "mm" });

// Small anchor block at a point (visual reference for where the tube connects)
function anchor(pos) {
  const s = 3;
  return box(s, s, s).translate(pos[0], pos[1], pos[2]);
}

// ── 1. L-bend: 90-degree pipe turn ──────────────────────────────
const pA1 = [0, 0, 0], pB1 = [30, 20, 0];
const lBend = transitionSurface(
  { point: pA1, tangent: [1, 0, 0] },
  { point: pB1, tangent: [0, 1, 0] },
  { radius, weightA: weight, weightB: weightB },
);

// ── 2. S-curve: opposing tangents ────────────────────────────────
const pA2 = [0, 40, 0], pB2 = [30, 60, 0];
const sCurve = transitionSurface(
  { point: pA2, tangent: [1, 0, 0] },
  { point: pB2, tangent: [-1, 0, 0] },
  { radius, weightA: weight, weightB: weightB },
);

// ── 3. 3D transition: going up and around ────────────────────────
const pA3 = [0, 0, 30], pB3 = [25, 15, 45];
const transition3D = transitionSurface(
  { point: pA3, tangent: [1, 0, 0] },
  { point: pB3, tangent: [0, 0, 1] },
  { radius, weightA: weight, weightB: weightB, up: [0, 1, 0] },
);

// ── 4. Asymmetric weight (3:0.5) ────────────────────────────────
const pA4 = [55, 0, 0], pB4 = [85, 20, 0];
const weighted = transitionSurface(
  { point: pA4, tangent: [1, 0, 0] },
  { point: pB4, tangent: [0, 1, 0] },
  { radius, weightA: 3.0, weightB: 0.5 },
);

// ── 5. Edge selection: connect edges of real shapes ──────────────
const boxA = box(10, 10, 10).translate(-5, -5, -35);
const boxB = box(10, 10, 10).translate(35, 15, -20);

const topEdgeA = selectEdge(boxA, { atZ: -25, parallel: [1, 0, 0] });
const bottomEdgeB = selectEdge(boxB, { atZ: -20, parallel: [1, 0, 0] });

const edgeConnector = connectEdges(topEdgeA, bottomEdgeB, {
  endA: 'mid',
  endB: 'mid',
  tangentModeA: 'outward',
  tangentModeB: 'outward',
  radius: 2,
  weightA: weight,
  weightB: weightB,
});

// ── 6. connectEdges shortcut ─────────────────────────────────────
const sideEdgeA = selectEdge(boxA, { near: [5, 0, -30], parallel: [0, 0, 1] });
const sideEdgeB = selectEdge(boxB, { near: [30, 15, -15], parallel: [0, 0, 1] });

const shortcutConnector = connectEdges(sideEdgeA, sideEdgeB, {
  endA: 'mid',
  endB: 'mid',
  tangentModeA: 'outward',
  tangentModeB: 'outward',
  radius: 1.5,
  weightA: weight,
  weightB: weightB,
});

// ── 7. Cylinder-to-box: connect with explicit tangents ───────────
// Cylinder: h=20, r=8, base at Z=0, shifted to Y=-55
const cyl = cylinder(20, 8).translate(0, -55, 0);
// Box: 12x12x12, corner at (25,-55,25)
const box2 = box(12, 12, 12).translate(25, -55, 25);

// Connect from cylinder rim (top, +X side at center Y=-55) to box left face
// Cylinder rim at Y=-55: full radius available, so X=8 is on the rim.
// Box left face at X=25, Y=-55 is on the face edge, Z=31 is mid-height.
// End tangent [1,0,0] means the curve arrives going +X (into the face).
const cylToBox = transitionSurface(
  { point: [8, -55, 20], tangent: [1, 0, 0.65] },
  { point: [25, -55, 31], tangent: [1, 0, 0] },
  { radius: 1.5, weightA: weight, weightB: weightB },
);

return [
  { name: "Anchor A1", shape: anchor(pA1).color('#555') },
  { name: "Anchor B1", shape: anchor(pB1).color('#555') },
  { name: "L-bend", shape: lBend.color('#4a90d9') },
  { name: "Anchor A2", shape: anchor(pA2).color('#555') },
  { name: "Anchor B2", shape: anchor(pB2).color('#555') },
  { name: "S-curve", shape: sCurve.color('#d94a4a') },
  { name: "Anchor A3", shape: anchor(pA3).color('#555') },
  { name: "Anchor B3", shape: anchor(pB3).color('#555') },
  { name: "3D transition", shape: transition3D.color('#4ad97a') },
  { name: "Anchor A4", shape: anchor(pA4).color('#555') },
  { name: "Anchor B4", shape: anchor(pB4).color('#555') },
  { name: "Weighted (3:0.5)", shape: weighted.color('#d9a64a') },
  { name: "Box A", shape: boxA.color('#888') },
  { name: "Box B", shape: boxB.color('#888') },
  { name: "Edge Connector", shape: edgeConnector.color('#4ad9d9') },
  { name: "Shortcut Connector", shape: shortcutConnector.color('#d94ad9') },
  { name: "Cylinder", shape: cyl.color('#aaa') },
  { name: "Box 2", shape: box2.color('#aaa') },
  { name: "Cyl-to-Box", shape: cylToBox.color('#d9d94a') },
];

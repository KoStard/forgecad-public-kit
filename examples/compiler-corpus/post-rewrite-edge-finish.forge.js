// Post-rewrite edge finishing: fillet/chamfer corners that survive hole, cut,
// and shell rewrites.
//
// Each section proves a different "broader workflow" combination so that
// regressions in any of the three propagation paths surface here first.

// ── Section A: hole → fillet surviving corners ───────────────────────────────
// Through-hole on the top face does not touch any of the four vertical side
// edges.  All four corners propagate as defended single descendants through the
// hole and are individually finishable afterwards.
const plateA = box(80, 50, 20, true);
const plateAHoled = plateA
  .hole(plateA.face('top'), { diameter: 16, upToFace: plateA.face('bottom') });

const plateAFin = filletEdge(plateAHoled, plateA.edge('vert-br'), 4, [-1, -1]);

// The chamfer targets the next corner using the same original owner reference
// but on the post-fillet shape, which carries a further propagated lineage.
const plateAFin2 = chamferEdge(plateAFin, plateA.edge('vert-bl'), 3, [1, -1]);

// ── Section B: cut → chamfer surviving corners ────────────────────────────────
// A rectangular cutout on the top face also leaves all four vertical corners
// unaffected, so they remain finishable through the cut propagation.
const plateB = box(60, 40, 16, true);
const pocket = roundedRect(28, 18, 2, true)
  .onFace(plateB, 'top', { u: 0, v: 0, selfAnchor: 'center' });
const plateBCut = plateB.cutout(pocket, { depth: 8 });

const plateBFin = chamferEdge(plateBCut, plateB.edge('vert-tr'), 2, [-1, 1]);
const plateBFin2 = filletEdge(plateBFin, plateB.edge('vert-tl'), 2, [1, 1]);

// ── Section C: shell → fillet outer corners ───────────────────────────────────
// Top-open shell keeps all four outer vertical edges on the untouched side
// faces.  Each is independently finishable because none is adjacent to the
// open top face.
const enclosure = box(70, 45, 30, true);
const shelled = enclosure.shell(2, { openFaces: ['top'] });

const shelledFin = filletEdge(shelled, enclosure.edge('vert-bl'), 3, [1, -1]);
const shelledFin2 = chamferEdge(shelledFin, enclosure.edge('vert-br'), 2, [-1, -1]);

// ── Section D: hole + boolean chain → fillet ─────────────────────────────────
// Prove that a vertical edge surviving a hole also survives a subsequent
// boolean union, remaining finishable through the full rewrite chain.
const baseD = box(90, 55, 22, true);
const boss = box(18, 12, 8, true).translate(24, 10, 15);
const baseDHoled = baseD
  .hole(baseD.face('top'), { diameter: 10, upToFace: baseD.face('bottom') });
const bodyD = baseDHoled.add(boss);
const bodyDFin = filletEdge(bodyD, baseD.edge('vert-bl'), 4, [1, -1]);

return [
  { name: 'Plate A — hole then fillet/chamfer corners', shape: plateAFin2 },
  { name: 'Plate B — cut then chamfer/fillet corners', shape: plateBFin2 },
  { name: 'Enclosure C — shell then fillet outer corners', shape: shelledFin2 },
  { name: 'Body D — hole + boolean then fillet corner', shape: bodyDFin },
];

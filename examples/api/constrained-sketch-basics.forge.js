/**
 * constrained-sketch-basics.forge.js
 *
 * Demonstrates the ForgeCAD 2D constraint API: geometric and dimensional
 * constraints on lines, circles, and points.
 */

// ─── 1. Fully constrained rectangle ─────────────────────────────────────────
// Four points + four lines, fixed origin, horizontal/vertical + parallel sides.
const rectangleSketch = (() => {
  const sk = constrainedSketch();

  const bl = sk.point(0, 0);
  const br = sk.point(40, 0);
  const tr = sk.point(40, 30);
  const tl = sk.point(0, 30);

  const bottom = sk.line(bl, br);
  const right  = sk.line(br, tr);
  const top    = sk.line(tr, tl);
  const left   = sk.line(tl, bl);

  sk.addLoop([bl, br, tr, tl]);

  sk.fix(bl);
  sk.horizontal(bottom);
  sk.vertical(right);
  sk.parallel(bottom, top);
  sk.parallel(right, left);
  sk.length(bottom, 40);
  sk.length(right, 30);

  return sk.solve().extrude(5);
})();

// ─── 2. Equilateral triangle ─────────────────────────────────────────────────
const triangleSketch = (() => {
  const sk = constrainedSketch();

  const p1 = sk.point(0, 0);
  const p2 = sk.point(20, 0);
  const p3 = sk.point(10, 17);

  const l1 = sk.line(p1, p2);
  const l2 = sk.line(p2, p3);
  const l3 = sk.line(p3, p1);

  sk.addLoop([p1, p2, p3]);

  sk.fix(p1);
  sk.horizontal(l1);
  sk.length(l1, 20);
  sk.equal(l1, l2);
  sk.equal(l1, l3);

  return sk.solve().extrude(3).translate(60, 0, 0);
})();

// ─── 3. Circle with constrained radius ───────────────────────────────────────
const circleSketch = (() => {
  const sk = constrainedSketch();
  const center = sk.point(0, 0);
  const circ = sk.circle(center, 10);

  sk.fix(center, 0, 0);
  sk.radius(circ, 15);

  return sk.solve().extrude(4).translate(0, 60, 0);
})();

// ─── 4. Parallel + equal: parallelogram ──────────────────────────────────────
// Two pairs of parallel, equal-length sides. The top line runs right-to-left
// (anti-parallel to bottom) — the solver handles this correctly.
const parallelSketch = (() => {
  const sk = constrainedSketch();

  const a1 = sk.point(0, 0);
  const a2 = sk.point(30, 0);
  const b2 = sk.point(25, 22); // solver will correct
  const b1 = sk.point(0, 20);

  const lineA = sk.line(a1, a2);
  const lineB = sk.line(b2, b1); // anti-parallel to lineA
  sk.line(a2, b2);
  sk.line(b1, a1);
  sk.addLoop([a1, a2, b2, b1]);

  sk.fix(a1);
  sk.horizontal(lineA);
  sk.parallel(lineA, lineB);
  sk.equal(lineA, lineB);
  sk.length(lineA, 30);
  sk.vDistance(a1, b1, 20);

  return sk.solve().extrude(5).translate(120, 0, 0);
})();

// ─── 5. Perpendicular lines (right triangle) ─────────────────────────────────
const perpSketch = (() => {
  const sk = constrainedSketch();

  const o  = sk.point(0, 0);
  const px = sk.point(25, 5);  // approximately right
  const py = sk.point(-3, 25); // solver will fix

  const lineX = sk.line(o, px);
  const lineY = sk.line(o, py);
  sk.line(px, py);
  sk.addLoop([o, px, py]);

  sk.fix(o);
  sk.perpendicular(lineX, lineY);
  sk.length(lineX, 25);
  sk.length(lineY, 25);

  return sk.solve().extrude(3).translate(60, 60, 0);
})();

// ─── 6. Midpoint constraint ───────────────────────────────────────────────────
// The midpoint of a bar is pinned to a known point. We visualise with a diamond.
const midpointSketch = (() => {
  const sk = constrainedSketch();

  const p0 = sk.point(-20, 0);
  const p1 = sk.point(20, 0);
  const bar = sk.line(p0, p1);

  // The midpoint marker (will be moved to bar's midpoint by solver)
  const mid = sk.point(5, 3);

  // Small diamond
  const d0 = sk.point(3, 0);
  const d1 = sk.point(0, 3);
  const d2 = sk.point(-3, 0);
  const d3 = sk.point(0, -3);
  sk.line(d0, d1); sk.line(d1, d2); sk.line(d2, d3); sk.line(d3, d0);
  sk.addLoop([d0, d1, d2, d3]);

  sk.fix(p0, -20, 0);
  sk.fix(p1, 20, 0);
  sk.midpoint(mid, bar);

  return sk.solve().extrude(2).translate(0, 120, 0);
})();

// ─── 7. Inscribed triangle via pointOnCircle ──────────────────────────────────
// Three vertices constrained to a construction circle, with equal side lengths.
const inscribedSketch = (() => {
  const sk = constrainedSketch();

  const cen = sk.point(0, 0);
  const circ = sk.circle(cen, 20, true); // construction circle

  const v0 = sk.point(0, 20);
  const v1 = sk.point(17, -10);
  const v2 = sk.point(-17, -10);

  const l01 = sk.line(v0, v1);
  const l12 = sk.line(v1, v2);
  const l20 = sk.line(v2, v0);
  sk.addLoop([v0, v1, v2]);

  sk.fix(cen, 0, 0);
  sk.radius(circ, 20);

  sk.pointOnCircle(v0, circ);
  sk.pointOnCircle(v1, circ);
  sk.pointOnCircle(v2, circ);

  sk.equal(l01, l12);
  sk.equal(l12, l20);

  return sk.solve().extrude(3).translate(120, 60, 0);
})();

// ─── 8. Symmetric trapezoid ──────────────────────────────────────────────────
// Points mirrored about a vertical construction axis.
const symSketch = (() => {
  const sk = constrainedSketch();

  // Symmetry axis: vertical construction line at x = 0
  const axBot = sk.point(0, -5, true);
  const axTop = sk.point(0, 35, true);
  const axis = sk.line(axBot, axTop, true);

  // Trapezoid vertices
  const bl = sk.point(-20, 0);
  const br = sk.point(20, 0);
  const tr = sk.point(10, 25);
  const tl = sk.point(-10, 25);

  const bottom = sk.line(bl, br);
  sk.line(br, tr);
  const top = sk.line(tr, tl);
  sk.line(tl, bl);
  sk.addLoop([bl, br, tr, tl]);

  sk.fix(axBot); sk.fix(axTop);
  sk.vertical(axis);
  sk.symmetric(bl, br, axis);
  sk.symmetric(tl, tr, axis);
  sk.horizontal(bottom);
  sk.horizontal(top);
  sk.length(bottom, 40);
  sk.length(top, 20);
  sk.vDistance(bl, tl, 25);

  return sk.solve().extrude(3).translate(0, -60, 0);
})();

// ─── 9. Concentric ring ──────────────────────────────────────────────────────
const ringSketch = (() => {
  const sk = constrainedSketch();

  const cen = sk.point(0, 0);
  const outer = sk.circle(cen, 20);

  // Inner circle — intentionally off-centre; concentric constraint will fix it
  const innerCen = sk.point(1, 0);
  const inner = sk.circle(innerCen, 12);

  sk.fix(cen, 0, 0);
  sk.radius(outer, 20);
  sk.concentric(outer, inner);
  sk.radius(inner, 12);
  const outerResult = sk.solve();

  // Build inner cutout as a separate sketch and subtract
  const holeSk = constrainedSketch();
  const hc = holeSk.point(0, 0, true);
  const hole = holeSk.circle(hc, 12);
  holeSk.fix(hc, 0, 0);
  holeSk.radius(hole, 12);
  const holeResult = holeSk.solve();

  return outerResult.subtract(holeResult).extrude(5).translate(60, -60, 0);
})();

return [
  { name: '1 - Rectangle',          shape: rectangleSketch },
  { name: '2 - Equilateral Tri',    shape: triangleSketch },
  { name: '3 - Circle',             shape: circleSketch },
  { name: '4 - Parallelogram',      shape: parallelSketch },
  { name: '5 - Perpendicular',      shape: perpSketch },
  { name: '6 - Midpoint',           shape: midpointSketch },
  { name: '7 - Inscribed Triangle', shape: inscribedSketch },
  { name: '8 - Symmetric Trapezoid',shape: symSketch },
  { name: '9 - Ring',               shape: ringSketch },
];

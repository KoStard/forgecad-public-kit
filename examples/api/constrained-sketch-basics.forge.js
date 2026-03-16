/**
 * constrained-sketch-basics.forge.js
 *
 * Demonstrates the ForgeCAD 2D constraint API: geometric and dimensional
 * constraints on lines, circles, and points.
 *
 * Each section builds a self-contained sketch that showcases one concept.
 */

// ─── 1. Fully constrained rectangle ─────────────────────────────────────────
// Origin point fixed → constrain width + height → all other points follow.
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

// ─── 4. Parallel lines with equal length ─────────────────────────────────────
const parallelSketch = (() => {
  const sk = constrainedSketch();

  const a1 = sk.point(0, 0);
  const a2 = sk.point(30, 0);
  const b1 = sk.point(0, 20);
  const b2 = sk.point(25, 22); // slightly off — solver will correct

  const lineA = sk.line(a1, a2);
  const lineB = sk.line(b1, b2);

  sk.line(a1, b1);
  sk.line(a2, b2);
  sk.addLoop([a1, a2, b2, b1]);

  sk.fix(a1);
  sk.horizontal(lineA);
  sk.parallel(lineA, lineB);
  sk.equal(lineA, lineB);
  sk.length(lineA, 30);
  sk.vDistance(a1, b1, 20);

  return sk.solve().extrude(5).translate(120, 0, 0);
})();

// ─── 5. Perpendicular lines ───────────────────────────────────────────────────
const perpSketch = (() => {
  const sk = constrainedSketch();

  const o  = sk.point(0, 0);
  const px = sk.point(25, 5);
  const py = sk.point(-3, 25);

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
// A cross-hair marker: a point is constrained to the midpoint of each of two lines.
const midpointSketch = (() => {
  const sk = constrainedSketch();

  // Horizontal bar
  const l0 = sk.point(-20, 0);
  const l1 = sk.point(20, 0);
  // Vertical bar
  const v0 = sk.point(0, -15);
  const v1 = sk.point(0, 15);

  const hBar = sk.line(l0, l1);
  const vBar = sk.line(v0, v1);

  // The intersection point must lie at the midpoint of both bars
  const ctr = sk.point(0, 0);
  sk.midpoint(ctr, hBar);
  sk.midpoint(ctr, vBar);

  // Build a small diamond shape centred at ctr to visualise it
  const dx = sk.point(3, 0);
  const dy = sk.point(0, 3);
  const dxn = sk.point(-3, 0);
  const dyn = sk.point(0, -3);

  sk.addLoop([dx, dy, dxn, dyn]);
  sk.line(dx, dy); sk.line(dy, dxn); sk.line(dxn, dyn); sk.line(dyn, dx);

  sk.fix(l0, -20, 0);
  sk.horizontal(hBar);
  sk.vertical(vBar);
  sk.length(hBar, 40);
  sk.length(vBar, 30);

  return sk.solve().extrude(2).translate(0, 120, 0);
})();

// ─── 7. Point on circle ───────────────────────────────────────────────────────
// An equilateral triangle inscribed in a circle via pointOnCircle constraints.
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

// ─── 8. Symmetric points about an axis ───────────────────────────────────────
const symSketch = (() => {
  const sk = constrainedSketch();

  // Symmetry axis: vertical line at x = 0
  const axA = sk.point(0, -30, true);
  const axB = sk.point(0, 30, true);
  const axis = sk.line(axA, axB);

  // Left and right points — right will mirror left
  const left  = sk.point(-15, 10);
  const right = sk.point(12, 8); // slightly off — solver will fix

  // Diamond shape using the two symmetric points + top/bottom
  const top = sk.point(0, 18);
  const bot = sk.point(0, -18);

  sk.line(left, top); sk.line(top, right); sk.line(right, bot); sk.line(bot, left);
  sk.addLoop([left, top, right, bot]);

  sk.fix(axA); sk.fix(axB);
  sk.symmetric(left, right, axis);
  sk.fix(top, 0, 18);
  sk.fix(bot, 0, -18);

  return sk.solve().extrude(3).translate(0, -60, 0);
})();

// ─── 9. Concentric circles (ring) ────────────────────────────────────────────
const ringSketch = (() => {
  const sk = constrainedSketch();

  const cen = sk.point(0, 0);
  const outer = sk.circle(cen, 20);
  const innerCen = sk.point(1, 0); // slightly off-centre — solver will fix
  const inner = sk.circle(innerCen, 12);

  sk.fix(cen, 0, 0);
  sk.radius(outer, 20);
  sk.concentric(outer, inner);
  sk.radius(inner, 12);

  const outerResult = sk.solve();

  // Build inner cutout separately and subtract
  const holeSk = constrainedSketch();
  const hc = holeSk.point(0, 0, true);
  const hole = holeSk.circle(hc, 12);
  holeSk.fix(hc, 0, 0);
  holeSk.radius(hole, 12);
  const holeResult = holeSk.solve();

  return outerResult.subtract(holeResult).extrude(5).translate(60, -60, 0);
})();

return [
  { name: '1 - Rectangle',         shape: rectangleSketch },
  { name: '2 - Equilateral Tri',   shape: triangleSketch },
  { name: '3 - Circle',            shape: circleSketch },
  { name: '4 - Parallel+Equal',    shape: parallelSketch },
  { name: '5 - Perpendicular',     shape: perpSketch },
  { name: '6 - Midpoint',          shape: midpointSketch },
  { name: '7 - Inscribed Triangle',shape: inscribedSketch },
  { name: '8 - Symmetric',         shape: symSketch },
  { name: '9 - Ring',              shape: ringSketch },
];

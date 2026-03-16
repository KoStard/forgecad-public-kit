/**
 * constrained-sketch-mechanical.forge.js
 *
 * Mechanical part sketches built entirely from parametric constraints.
 * Change one param and the whole sketch updates.
 *
 * Parts:
 *   1. Slotted plate     — rectangle with a centred rectangular slot
 *   2. Motor mount plate  — T-shaped profile, all dimensions constrained
 *   3. Mounting flange   — square plate with bolt holes
 *   4. Connecting rod    — constrained trapezoid with symmetric sides
 */

const W  = param('width',  60, { min: 30, max: 120, unit: 'mm' });
const H  = param('height', 40, { min: 20, max: 80, unit: 'mm' });
const T  = param('thick',   8, { min: 3, max: 20, unit: 'mm' });
const R  = param('radius', 10, { min: 5, max: 25, unit: 'mm' });

// ─── 1. Slotted plate ─────────────────────────────────────────────────────────
const slottedPlate = (() => {
  const slotW = W * 0.3;
  const slotH = H * 0.5;
  const slotX = (W - slotW) / 2;
  const slotY = (H - slotH) / 2;

  // Outer profile
  const outer = constrainedSketch();
  const o0 = outer.point(0, 0);
  const o1 = outer.point(W, 0);
  const o2 = outer.point(W, H);
  const o3 = outer.point(0, H);
  const ob = outer.line(o0, o1);
  const or_ = outer.line(o1, o2);
  outer.line(o2, o3);
  outer.line(o3, o0);
  outer.addLoop([o0, o1, o2, o3]);
  outer.fix(o0);
  outer.horizontal(ob);
  outer.vertical(or_);
  outer.length(ob, W);
  outer.length(or_, H);
  const outerResult = outer.solve();

  // Slot cutout
  const slot = constrainedSketch();
  const s0 = slot.point(slotX, slotY);
  const s1 = slot.point(slotX + slotW, slotY);
  const s2 = slot.point(slotX + slotW, slotY + slotH);
  const s3 = slot.point(slotX, slotY + slotH);
  const sb = slot.line(s0, s1);
  const sr = slot.line(s1, s2);
  slot.line(s2, s3);
  slot.line(s3, s0);
  slot.addLoop([s0, s1, s2, s3]);
  slot.fix(s0, slotX, slotY);
  slot.horizontal(sb);
  slot.vertical(sr);
  slot.length(sb, slotW);
  slot.length(sr, slotH);
  const slotResult = slot.solve();

  return outerResult.subtract(slotResult).extrude(T);
})();

// ─── 2. Motor mount plate (T-shape) ──────────────────────────────────────────
// A T-shaped profile: wide flange on top, narrow stem below.
// Stem is centred on the flange via midpoint constraint.
const motorMount = (() => {
  const flangeW = W;
  const flangeH = T;
  const stemW = W * 0.3;
  const stemH = H - flangeH;

  const sk = constrainedSketch();

  // T-shape outline (counter-clockwise):
  // Start at bottom-left of stem, go around
  const stemLeft  = (flangeW - stemW) / 2;
  const stemRight = stemLeft + stemW;

  const p0 = sk.point(stemLeft, 0);         // bottom-left of stem
  const p1 = sk.point(stemRight, 0);        // bottom-right of stem
  const p2 = sk.point(stemRight, stemH);    // where stem meets flange right
  const p3 = sk.point(flangeW, stemH);      // flange bottom-right corner
  const p4 = sk.point(flangeW, stemH + flangeH); // flange top-right
  const p5 = sk.point(0, stemH + flangeH);  // flange top-left
  const p6 = sk.point(0, stemH);            // flange bottom-left corner
  const p7 = sk.point(stemLeft, stemH);     // where stem meets flange left

  const stemBot  = sk.line(p0, p1);
  const stemR    = sk.line(p1, p2);
  const stepR    = sk.line(p2, p3);
  const flangeR  = sk.line(p3, p4);
  const flangeTop= sk.line(p4, p5);
  const flangeL  = sk.line(p5, p6);
  const stepL    = sk.line(p6, p7);
  const stemL    = sk.line(p7, p0);

  sk.addLoop([p0, p1, p2, p3, p4, p5, p6, p7]);

  // Fix origin, make all edges horizontal or vertical
  sk.fix(p0, stemLeft, 0);
  sk.horizontal(stemBot);
  sk.vertical(stemR);
  sk.horizontal(stepR);
  sk.vertical(flangeR);
  sk.horizontal(flangeTop);
  sk.vertical(flangeL);
  sk.horizontal(stepL);
  sk.vertical(stemL);

  // Dimensions
  sk.length(stemBot, stemW);
  sk.length(stemR, stemH);
  sk.length(flangeTop, flangeW);
  sk.length(flangeR, flangeH);

  // Symmetry: stem is centred on the flange
  // Use equal step widths (stepL == stepR)
  sk.equal(stepR, stepL);

  return sk.solve().extrude(T).translate(W + 20, 0, 0);
})();

// ─── 3. Mounting flange ───────────────────────────────────────────────────────
// Square plate with a central hole and four symmetric bolt holes.
const mountingFlange = (() => {
  const boltR  = R * 0.35;
  const margin = R * 1.2;

  // Outer plate
  const outer = constrainedSketch();
  const p0 = outer.point(0, 0);
  const p1 = outer.point(W, 0);
  const p2 = outer.point(W, W);
  const p3 = outer.point(0, W);
  const bottom = outer.line(p0, p1);
  const right  = outer.line(p1, p2);
  outer.line(p2, p3);
  outer.line(p3, p0);
  outer.addLoop([p0, p1, p2, p3]);
  outer.fix(p0);
  outer.horizontal(bottom);
  outer.vertical(right);
  outer.length(bottom, W);
  outer.equal(bottom, right);
  const outerResult = outer.solve();

  // Central hole
  const centerHoleSk = constrainedSketch();
  const cen = centerHoleSk.point(W / 2, W / 2, true);
  const centerHole = centerHoleSk.circle(cen, R);
  centerHoleSk.fix(cen, W / 2, W / 2);
  centerHoleSk.radius(centerHole, R);
  const centerHoleResult = centerHoleSk.solve();

  // Four bolt holes at corners
  const boltPositions = [
    [margin, margin],
    [W - margin, margin],
    [W - margin, W - margin],
    [margin, W - margin],
  ];

  const boltResults = boltPositions.map(([bx, by]) => {
    const boltSk = constrainedSketch();
    const bc = boltSk.point(bx, by, true);
    const bolt = boltSk.circle(bc, boltR);
    boltSk.fix(bc, bx, by);
    boltSk.radius(bolt, boltR);
    return boltSk.solve();
  });

  let result = outerResult.subtract(centerHoleResult);
  boltResults.forEach((br) => { result = result.subtract(br); });

  return result.extrude(T).translate(0, H + 20, 0);
})();

// ─── 4. Connecting rod (symmetric trapezoid) ──────────────────────────────────
// A trapezoid whose left/right halves are mirror-symmetric, with constrained
// top width, bottom width, and height. Driven entirely by constraints.
const connectingRod = (() => {
  const topW = W * 0.4;
  const botW = W;
  const rodH = H;

  const sk = constrainedSketch();

  // Trapezoid vertices
  const bl = sk.point(-botW / 2, 0);
  const br = sk.point(botW / 2, 0);
  const tr = sk.point(topW / 2, rodH);
  const tl = sk.point(-topW / 2, rodH);

  const bottom = sk.line(bl, br);
  const right  = sk.line(br, tr);
  const top    = sk.line(tr, tl);
  const left   = sk.line(tl, bl);

  sk.addLoop([bl, br, tr, tl]);

  // Symmetry axis: vertical construction line at x = 0
  const axBot = sk.point(0, -10, true);
  const axTop = sk.point(0, rodH + 10, true);
  const axis = sk.line(axBot, axTop, true); // construction line

  sk.fix(axBot); sk.fix(axTop);
  sk.vertical(axis);

  // Points are symmetric about the axis
  sk.symmetric(bl, br, axis);
  sk.symmetric(tl, tr, axis);

  // Bottom and top are horizontal + parallel
  sk.horizontal(bottom);
  sk.horizontal(top);

  // Sides are equal length
  sk.equal(right, left);

  // Dimensions
  sk.length(bottom, botW);
  sk.length(top, topW);
  sk.vDistance(bl, tl, rodH);

  return sk.solve().extrude(T / 2).translate(0, -(rodH + 20), 0);
})();

return [
  { name: '1 - Slotted Plate',      shape: slottedPlate },
  { name: '2 - Motor Mount (T)',     shape: motorMount },
  { name: '3 - Mounting Flange',     shape: mountingFlange },
  { name: '4 - Connecting Rod',      shape: connectingRod },
];

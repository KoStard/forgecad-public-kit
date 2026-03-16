/**
 * constrained-sketch-mechanical.forge.js
 *
 * Mechanical part sketches built entirely from parametric constraints.
 * Change one param and the whole sketch updates.
 *
 * Parts:
 *   1. Slotted plate     — rectangle with a centred rectangular slot
 *   2. Angle bracket     — two legs at a user-defined angle
 *   3. Mounting flange   — square plate with bolt holes
 *   4. Link arm          — two circles connected by tangent lines (capsule)
 */

const W  = param('width',  60, { min: 30, max: 120, unit: 'mm' });
const H  = param('height', 40, { min: 20, max: 80, unit: 'mm' });
const T  = param('thick',   8, { min: 3, max: 20, unit: 'mm' });
const R  = param('radius', 10, { min: 5, max: 25, unit: 'mm' });
const ANGLE = param('legAngle', 45, { min: 10, max: 150 });

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
  const or = outer.line(o1, o2);
  outer.line(o2, o3);
  outer.line(o3, o0);
  outer.addLoop([o0, o1, o2, o3]);
  outer.fix(o0);
  outer.horizontal(ob);
  outer.vertical(or);
  outer.length(ob, W);
  outer.length(or, H);
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

// ─── 2. Angle bracket ────────────────────────────────────────────────────────
// Two equal-length legs joined at the origin, at a specified angle.
const angleBracket = (() => {
  const legLen = Math.max(W, H);
  const rad = (ANGLE * Math.PI) / 180;

  const sk = constrainedSketch();

  // Pivot at origin
  const pivot = sk.point(0, 0);

  // Leg A (horizontal)
  const aEnd  = sk.point(legLen, 0);
  const aTop  = sk.point(legLen, T);
  const aBase = sk.point(0, T);

  // Leg B (at ANGLE degrees, approximate start positions)
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const bEnd   = sk.point(cos * legLen, sin * legLen);
  const bOuter = sk.point(cos * legLen - sin * T, sin * legLen + cos * T);
  const bBase  = sk.point(-sin * T, cos * T);

  const legABot  = sk.line(pivot, aEnd);
  const legAEnd  = sk.line(aEnd, aTop);
  const legATop  = sk.line(aTop, aBase);
  sk.line(aBase, bBase);
  const legBLeft = sk.line(bBase, bEnd);
  sk.line(bEnd, bOuter);
  sk.line(bOuter, pivot);

  sk.addLoop([pivot, aEnd, aTop, aBase, bBase, bEnd, bOuter]);

  sk.fix(pivot);
  sk.horizontal(legABot);
  sk.length(legABot, legLen);
  sk.vertical(legAEnd);
  sk.angle(legABot, legBLeft, ANGLE);
  sk.equal(legABot, legBLeft);

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

// ─── 4. Link arm (capsule) ────────────────────────────────────────────────────
// Two circles connected by two external tangent lines.
const linkArm = (() => {
  const r1 = R;
  const r2 = R * 0.6;
  const armLen = W;

  const sk = constrainedSketch();

  const cL = sk.point(0, 0);
  const cR = sk.point(armLen, 0);

  const circL = sk.circle(cL, r1);
  const circR = sk.circle(cR, r2);

  // Tangent lines connecting the two circles
  const tL = sk.point(0, r1);
  const tR = sk.point(armLen, r2);
  const topLine = sk.line(tL, tR);

  const bL = sk.point(0, -r1);
  const bR = sk.point(armLen, -r2);
  const botLine = sk.line(bL, bR);

  sk.fix(cL, 0, 0);
  sk.fix(cR, armLen, 0);
  sk.radius(circL, r1);
  sk.radius(circR, r2);

  sk.tangent(topLine, circL);
  sk.tangent(topLine, circR);
  sk.tangent(botLine, circL);
  sk.tangent(botLine, circR);

  return sk.solve().extrude(T / 2).translate(0, -(r1 + 20), 0);
})();

return [
  { name: '1 - Slotted Plate',    shape: slottedPlate },
  { name: '2 - Angle Bracket',    shape: angleBracket },
  { name: '3 - Mounting Flange',  shape: mountingFlange },
  { name: '4 - Link Arm',         shape: linkArm },
];

/**
 * smooth-curve-connections.forge.js
 *
 * Smooth curve connections — three ways to create organic, flowing profiles.
 *
 *   1. arcByCenter   — Gothic arch with analytically-placed crown point
 *   2. bezierTo      — cubic Bezier S-curve in a mixed profile
 *   3. bezierTo      — manual tangent-continuous blend with computed control points
 *
 * Drag the Blend Weight slider to shift the blend shape!
 */

const blendWeight = param('Blend Weight', 0.5, { min: 0.1, max: 0.9, step: 0.05 });

// ─── 1. Gothic arch — two arcs meeting at a point ──────────────────────────
// Two arcs sharing a crown point — smooth by construction since both
// arc centers lie on the base line and the crown is analytically placed.

const smoothArch = (() => {
  const sk = constrainedSketch();
  const w = 15;
  const R = 2 * w;
  const crownY = Math.sqrt(R * R - w * w);

  const baseL = sk.point(-w, 0);
  const baseR = sk.point(w, 0);
  const crown = sk.point(0, crownY);
  sk.fix(baseL);
  sk.fix(baseR);
  sk.fix(crown);

  const arc1 = sk.arcByCenter(baseR, baseL, crown, true);
  const arc2 = sk.arcByCenter(baseL, crown, baseR, true);

  const bottom = sk.line(baseR, baseL);
  sk.addProfileLoop([
    { kind: 'arc', arc: arc1 },
    { kind: 'arc', arc: arc2 },
    { kind: 'line', line: bottom },
  ]);

  return sk.solve().extrude(8);
})();

// ─── 2. Bezier bottle profile ─────────────────────────────────────────────
// bezierTo() draws a smooth organic curve — just specify control points.

const bezierProfile = (() => {
  const sk = constrainedSketch();
  const w = 25, h = 40;

  sk.moveTo(0, 0);
  sk.lineTo(w, 0);
  sk.bezierTo(
    w + 12, h * 0.25,   // CP1 — belly bulge outward
    w - 6,  h * 0.65,   // CP2 — waist pinch inward
    w,      h            // end at top-right
  );
  sk.lineTo(0, h);
  sk.close();

  return sk.solve().extrude(8).translate(55, 0, 0);
})();

// ─── 3. Arc → bezier blend → line ──────────────────────────────────────────
// Manual tangent-continuous blend: compute the departure tangent from the arc
// and place bezier control points to maintain smoothness.

const blendedProfile = (() => {
  const sk = constrainedSketch();
  const r = 15;
  const endX = r + 30, endY = r + 10;

  // Arc departure point is (r, r) for a quarter-circle from (0,0) with radius r
  // Tangent at departure is horizontal (pointing right) for a CCW quarter-circle
  const handleLen = 20 * blendWeight;

  sk.moveTo(0, 0);
  sk.lineTo(0, 0);  // dummy to start profile
  sk.moveTo(0, 0);
  sk.lineTo(r, 0);
  sk.bezierTo(
    r + handleLen, 0,               // CP1: depart horizontally from arc end
    endX, endY - handleLen * 0.5,   // CP2: approach target from below
    endX, endY,                     // end point
  );
  sk.lineTo(endX, 0);
  sk.close();

  return sk.solve().extrude(8).translate(120, 0, 0);
})();

return [smoothArch, bezierProfile, blendedProfile];

/**
 * smooth-curve-connections.forge.js
 *
 * Smooth curve connections — three ways to create organic, flowing profiles.
 *
 *   1. arcTangentArc — G1 smooth Gothic arch (auto-detects shared endpoint)
 *   2. bezierTo      — cubic Bezier S-curve in a mixed profile
 *   3. blendTo       — smooth arc-to-point blend using the path API
 *
 * Drag the Blend Weight slider to shift the blend shape!
 */

const blendWeight = param('Blend Weight', 0.5, { min: 0.1, max: 0.9, step: 0.05 });

// ─── 1. Gothic arch — two tangent arcs ─────────────────────────────────────
// Two arcs meeting at a pointed crown. arcTangentArc enforces G1 smoothness.
// No need to specify aAtStart/bAtStart — it auto-detects the shared endpoint.

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

  const arc1 = sk.arcByCenter(baseR, baseL, crown, true);
  const arc2 = sk.arcByCenter(baseL, crown, baseR, true);

  // Just pass the two arcs — shared endpoint detected automatically
  sk.arcTangentArc(arc1, arc2);

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

// ─── 3. Arc → blend → line using the path API ────────────────────────────
// blendTo() smoothly departs from the previous arc toward a target point.
// The weight parameter controls how long the arc's shape is preserved.

const blendedProfile = (() => {
  const sk = constrainedSketch();
  const r = 15;

  sk.moveTo(0, 0);
  sk.arcTo(r, r, r, false);                    // quarter-circle arc
  sk.blendTo(r + 30, r + 10, blendWeight);     // smooth blend away from arc
  sk.lineTo(r + 30, 0);                        // drop down
  sk.close();                                   // back to origin

  return sk.solve().extrude(8).translate(120, 0, 0);
})();

return [smoothArch, bezierProfile, blendedProfile];

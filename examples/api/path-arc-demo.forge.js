/**
 * path-arc-demo.forge.js
 *
 * Exercises path().arcTo() — the new arc support in the simple path() builder.
 * Compare with arc-chain-demo.forge.js which uses constrainedSketch().
 */

const r = param('Corner Radius', 4, { min: 1, max: 10 });
const R = param('Cap Radius', 25, { min: 10, max: 60 });
const depth = param('Depth', 5);

// ── 1. Quarter-circle sector (two lines + one arc) ───────────────────────────
const sector = (() => {
  const radius = 20;
  return path()
    .moveTo(0, 0)
    .lineTo(radius, 0)
    .arcTo(0, radius, radius, false) // CCW quarter circle
    .close()
    .extrude(depth);
})();

// ── 2. S-curve closed shape (two chained arcs) ───────────────────────────────
const sCurve = (() => {
  const cr = 12;
  return path()
    .moveTo(0, 0)
    .arcTo(cr, cr, cr, false)    // CCW
    .arcTo(0, cr * 2, cr, true)  // CW — S bend
    .lineTo(0, 0)
    .close()
    .extrude(depth)
    .translate(50, 0, 0);
})();

// ── 3. Parallel lines + triple-arc cap (the original use case) ───────────────
const cap = (() => {
  const L = 40, W = 20;
  return path()
    .moveTo(0, 0)
    .lineTo(L, 0)
    .arcTo(L + r, r, r, true)          // small corner arc
    .arcTo(L + r, W - r, R, false)     // large cap arc (bulges outward)
    .arcTo(L, W, r, true)              // small corner arc
    .lineTo(0, W)
    .close()
    .extrude(depth)
    .translate(0, 40, 0);
})();

// ── 4. Full circle via two semicircular arcs ─────────────────────────────────
const fullCircle = (() => {
  const cr = 10;
  return path()
    .moveTo(-cr, 0)
    .arcTo(cr, 0, cr, false)   // top half
    .arcTo(-cr, 0, cr, false)  // bottom half
    .close()
    .extrude(depth)
    .translate(50, 40, 0);
})();

return [sector, sCurve, cap, fullCircle];

/**
 * path-smooth-cap-demo.forge.js
 *
 * Demonstrates smoothCapTo() — a single call that inserts a G1-continuous
 * triple-arc end cap (corner arc → large outward arc → corner arc).
 *
 * Compare with path-arc-demo.forge.js which uses three manual arcTo() calls
 * that require careful hand-tuning of junction points to avoid kinks.
 */

const cornerRadius = param('Corner Radius', 4, { min: 1, max: 12 });
const capRadius    = param('Cap Radius',    18, { min: 6, max: 40 });
const depth        = param('Depth', 6);

const L = 40;
const W = 20;

// ── 1. Slot with smooth end cap (the primary demo) ───────────────────────────
const smoothSlot = path()
  .moveTo(0, 0)
  .lineTo(L, 0)
  .smoothCapTo(L, W, cornerRadius, capRadius)  // auto-computed G1 junctions
  .lineTo(0, W)
  .close()
  .extrude(depth);

// ── 2. Back-to-back smooth caps (stadium / capsule-like shape) ────────────────
const stadium = path()
  .moveTo(0, 0)
  .lineTo(L, 0)
  .smoothCapTo(L, W, cornerRadius, capRadius)   // right cap
  .lineTo(0, W)
  .smoothCapTo(0, 0, cornerRadius, capRadius)   // left cap (reversed direction)
  .close()
  .extrude(depth)
  .translate(0, 50, 0);

return [smoothSlot, stadium];

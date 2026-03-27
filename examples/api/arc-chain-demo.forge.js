/**
 * arc-chain-demo.forge.js
 *
 * Demonstrates chaining arcs in constrainedSketch():
 *   two parallel lines connected on one end by a triple-arc cap
 *   (small corner arc → large center arc → small corner arc)
 *
 * This is the idiomatic way to do arc chains in ForgeCAD today,
 * since path() only supports straight lines.
 */

const L = param('Length', 40, { min: 20, max: 80 });
const W = param('Width', 20, { min: 10, max: 40 });
const r = param('Corner Radius', 4, { min: 1, max: 8 });
const R = param('Cap Radius', 25, { min: 10, max: 60 });
const depth = param('Depth', 8, { min: 2, max: 20 });

// ── Shape: parallel lines with triple-arc right end ─────────────────────────
//
//   (0,0)────────────────(L,0)
//                              \  ← small arc r (corner)
//                               )  ← large arc R (cap, bulges right)
//                              /  ← small arc r (corner)
//   (0,W)────────────────(L,W)
//   ←──── straight close ─────┘
//
// arcTo(x, y, radius, clockwise):
//   - clockwise=true  → arc curves to the right of the start→end direction
//   - clockwise=false → arc curves to the left  of the start→end direction

const sk = constrainedSketch();

sk.moveTo(0, 0);

// Top line →
sk.lineTo(L, 0);

// Top-right corner: small arc, rounding the inside corner toward the cap
sk.arcTo(L + r, r, r, true);

// Large cap arc: connects (L+r, r) → (L+r, W-r), bulging outward to the right
// clockwise=true means center is to the right of the up direction → pushes left (inward)
// clockwise=false means center is to the left of the up direction → pushes right (outward bulge)
sk.arcTo(L + r, W - r, R, false);

// Bottom-right corner: mirror of top corner
sk.arcTo(L, W, r, true);

// Bottom line ←
sk.lineTo(0, W);

// Left end: straight close
sk.close();

return sk.solve().extrude(depth);

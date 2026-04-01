/**
 * path-builder-showcase.forge.js
 *
 * Demonstrates all PathBuilder features:
 * 1. bezierTo — cubic bezier curves
 * 2. tangentBezierTo — G1-continuous bezier
 * 3. smoothThrough — Catmull-Rom spline
 * 4. fillet / chamfer — corner modifiers
 * 5. mirror — symmetric profiles
 * 6. compound paths — shapes with holes
 * 7. closeOffset — offset before extrude
 */

const depth = param('Depth', 5);
const row1Y = 0;
const row2Y = 40;
const row3Y = 80;

// ── 1. Bezier arch ───────────────────────────────────────────────────────────
const bezierArch = path()
  .moveTo(0, 0)
  .bezierTo(5, 18, 15, 18, 20, 0)
  .close()
  .extrude(depth);

// ── 2. Tangent bezier — G1 smooth after a line ──────────────────────────────
const tangentBez = path()
  .moveTo(0, 0)
  .lineTo(8, 0)
  .tangentBezierTo(14, 12, 20, 0)
  .close()
  .extrude(depth)
  .translate(25, row1Y, 0);

// ── 3. Spline through waypoints ─────────────────────────────────────────────
const splineShape = path()
  .moveTo(0, 0)
  .smoothThrough([[5, 8], [10, -3], [15, 6], [20, 0]], 0.3)
  .lineTo(20, -5)
  .lineTo(0, -5)
  .close()
  .extrude(depth)
  .translate(50, row1Y, 0);

// ── 4. Filleted rectangle ───────────────────────────────────────────────────
const filletRect = path()
  .moveTo(0, 0)
  .lineTo(20, 0)
  .lineTo(20, 15).fillet(3)
  .lineTo(0, 15).fillet(3)
  .close()
  .extrude(depth)
  .translate(0, row2Y, 0);

// ── 5. Chamfered rectangle ──────────────────────────────────────────────────
const chamferRect = path()
  .moveTo(0, 0)
  .lineTo(20, 0)
  .lineTo(20, 15).chamfer(3)
  .lineTo(0, 15).chamfer(3)
  .close()
  .extrude(depth)
  .translate(25, row2Y, 0);

// ── 6. Mirror — build half, get symmetric whole ─────────────────────────────
const mirrorProfile = path()
  .moveTo(0, 0)
  .lineTo(10, 0)
  .lineTo(10, 5)
  .arcTo(10, 10, 5, false)
  .mirror('x')
  .close()
  .extrude(depth)
  .translate(50, row2Y, 0);

// ── 7. Compound path with hole ──────────────────────────────────────────────
const withHole = path()
  .moveTo(0, 0).lineTo(25, 0).lineTo(25, 20).lineTo(0, 20)        // outer
  .moveTo(8, 5).lineTo(17, 5).lineTo(17, 15).lineTo(8, 15)        // hole
  .close()
  .extrude(depth)
  .translate(0, row3Y, 0);

// ── 8. Offset shape — expanded outline ──────────────────────────────────────
const offsetShape = path()
  .moveTo(5, 5)
  .lineTo(15, 5)
  .lineTo(15, 15)
  .lineTo(5, 15)
  .closeOffset(2, 'Round')
  .extrude(depth)
  .translate(30, row3Y, 0);

// ── 9. Relative moves — same as absolute, more convenient ───────────────────
const relativeSquare = path()
  .moveTo(0, 0)
  .lineBy(15, 0)
  .lineBy(0, 15)
  .lineBy(-15, 0)
  .close()
  .extrude(depth)
  .translate(55, row3Y, 0);

return [
  bezierArch, tangentBez, splineShape,
  filletRect, chamferRect, mirrorProfile,
  withHole, offsetShape, relativeSquare,
];

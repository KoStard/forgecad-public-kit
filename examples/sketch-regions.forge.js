/**
 * Sketch Region Selection — Feature Demo
 *
 * Demonstrates the three 2D sketch surface-selection APIs:
 *
 *   1. sketch.regions() / sketch.region(seed)
 *      Decompose any Manifold-backed sketch into its distinct filled areas.
 *      Perfect for picking one island out of a boolean-composed sketch.
 *
 *   2. ConstraintSketch.detectArrangement() / detectArrangementRegion(seed)
 *      After solving a constrained sketch, detect all bounded faces formed
 *      by the line arrangement — no explicit loops needed.
 *
 *   3. ConstrainedSketchBuilder.referenceFrom() / referenceAllFrom()
 *      Import fixed geometry from another solved sketch as construction
 *      references, enabling cross-sketch constraints.
 *
 * Result: an assembly of extruded shapes illustrating each feature.
 */

// ─── Part 1 — sketch.region() on a boolean sketch ────────────────────────────
// A "T" cross-section: wide base + narrow stem. The boolean creates one
// connected region; we pick it with the regions() API.

const base = rect(120, 20, true);                   // centered at origin
const stem = rect(30, 50, true).translate(0, 35);   // stem centered above base
const tShape = base.add(stem);
const [tRegion] = tShape.regions();                  // one connected T region
const tPart = tRegion.extrude(6);                    // extrude the T profile

// ─── Part 2 — frame region from boolean subtraction ──────────────────────────
// A 100×40 plate with a 60×20 hole punched in the center, leaving a frame.
// Pick the frame ring as one region using a corner seed.

const plate = rect(100, 40, true);                   // centered at origin
const hole  = rect(60, 20, true);                    // centered cutout
const frame = plate.subtract(hole);

// The seed [45, 15] is in the top-right corner — inside the frame wall, outside the hole.
const frameRing = frame.region([45, 15]);
const framePart = frameRing.onFace(tPart, 'top').extrude(4);

// ─── Part 3 — detectArrangement() on a constrained sketch ────────────────────
// Draw a 3×2 grid of lines (two vertical dividers + one horizontal divider)
// inside a 150×80 enclosing box. No explicit addLoop() calls — the arrangement
// algorithm detects all 6 cells automatically.

const grid = constrainedSketch();

// Outer box corners
const g00 = grid.point(0,   0);   const g30 = grid.point(150,  0);
const g31 = grid.point(150, 80);  const g01 = grid.point(0,   80);

// Vertical divider endpoints at x=50 and x=100
const gv0a = grid.point(50,  0);  const gv0b = grid.point(50,  80);
const gv1a = grid.point(100, 0);  const gv1b = grid.point(100, 80);

// Horizontal divider endpoints at y=40
const gh0a = grid.point(0,  40);  const gh0b = grid.point(150, 40);

// Outer boundary (split at divider junction points on bottom/top/left edges)
grid.line(g00, gv0a); grid.line(gv0a, gv1a); grid.line(gv1a, g30);   // bottom
grid.line(g30, g31);                                                    // right
grid.line(g31, gv1b); grid.line(gv1b, gv0b); grid.line(gv0b, g01);   // top
grid.line(g01, gh0a); grid.line(gh0a, g00);                            // left (split at y=40)

// Vertical dividers
grid.line(gv0a, gv0b);
grid.line(gv1a, gv1b);

// Horizontal divider — full width, the arrangement algorithm handles
// the X-crossings with the vertical dividers automatically
grid.line(gh0a, gh0b);

// Fix all points (fully constrained grid)
grid.fix(g00, 0, 0); grid.fix(g30, 150, 0); grid.fix(g31, 150, 80); grid.fix(g01, 0, 80);
grid.fix(gv0a, 50, 0); grid.fix(gv0b, 50, 80);
grid.fix(gv1a, 100, 0); grid.fix(gv1b, 100, 80);
grid.fix(gh0a, 0, 40); grid.fix(gh0b, 150, 40);

const gridSketch = grid.solve();
const cells = gridSketch.detectArrangement();        // returns 6 cells, largest-first

// Pick specific cells by seed point
const topLeft     = gridSketch.detectArrangementRegion([25,  60]);
const topMiddle   = gridSketch.detectArrangementRegion([75,  60]);
const topRight    = gridSketch.detectArrangementRegion([125, 60]);
const bottomLeft  = gridSketch.detectArrangementRegion([25,  20]);
const bottomRight = gridSketch.detectArrangementRegion([125, 20]);

// Extrude cells at different heights to make a stepped surface
const cellHeight = [12, 8, 10, 6, 14, 10];
const extrudedCells = cells.map((cell, i) => cell.extrude(cellHeight[i]));
const gridPart = union(...extrudedCells).translate(160, 0, 0);

// ─── Part 4 — cross-sketch reference geometry ─────────────────────────────────
// Sketch A: a triangular profile with fixed vertices.
// Sketch B: a second triangle constrained to be parallel to one of A's edges.

const builderA = constrainedSketch();
const a1 = builderA.point(0,  0);
const a2 = builderA.point(80, 0);
const a3 = builderA.point(40, 60);
const aBot = builderA.line(a1, a2);
builderA.fix(a1, 0, 0); builderA.fix(a2, 80, 0); builderA.fix(a3, 40, 60);
builderA.addLoop([a1, a2, a3]);
const sketchA = builderA.solve();
const triangleA = sketchA.extrude(8).translate(0, 100, 0);

const builderB = constrainedSketch();
// Import A's bottom edge as a fixed reference line in B
const refBase = builderB.referenceFrom(sketchA, aBot);
// Draw a wider triangle on top
const b1 = builderB.point(-10, 10);
const b2 = builderB.point(90,  10);
const b3 = builderB.point(40,  50);
const bBot = builderB.line(b1, b2);
// Constrain B's base to be parallel to A's base (imported as reference)
if (refBase) builderB.parallel(bBot, refBase);
builderB.fix(b1, -10, 10); builderB.fix(b2, 90, 10); builderB.fix(b3, 40, 50);
builderB.addLoop([b1, b2, b3]);
const sketchB = builderB.solve();
const triangleB = sketchB.extrude(5).translate(0, 100, 8);

const crossSketchPart = union(triangleA, triangleB).translate(0, 100, 0);

// ─── Final assembly ───────────────────────────────────────────────────────────
return union(tPart.add(framePart), gridPart, crossSketchPart);

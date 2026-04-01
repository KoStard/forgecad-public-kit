/**
 * ForgeCAD Verification API — demo
 *
 * Shows how to embed geometry assertions inside a .forge.js script.
 * Tests are non-fatal: the model renders even when checks fail.
 * Failing checks appear in the Checks panel with click-to-navigate.
 *
 * API: https://forgecad.dev/docs/verification
 */

// -----------------------------------------------------------------------
// Build a simple two-plate bracket assembly
// -----------------------------------------------------------------------

const plateW  = 60;
const plateH  = 40;
const thick   = 5;
const gapZ    = 20;  // intentional gap between plates

const bottomPlate = box(plateW, plateH, thick);
const topPlate    = box(plateW, plateH, thick)
  .translate(0, 0, thick + gapZ);

// A small peg that should sit exactly centred on the bottom plate
const peg = cylinder(gapZ, 4).translate(plateW / 2, plateH / 2, thick);

// A floating cube — deliberately placed so it collides with the bottom plate
const collider = box(10, 10, 10).translate(5, 5, 2);

// -----------------------------------------------------------------------
// Geometry checks
// -----------------------------------------------------------------------

// ✓  Each plate has the right volume
const plateVolume = plateW * plateH * thick;
verify.volumeApprox("bottom plate volume", bottomPlate, plateVolume, 5);
verify.volumeApprox("top plate volume",    topPlate,    plateVolume, 5);

// ✓  Both plates have the same bounding-box footprint
verify.boundingBoxSize("bottom plate size", bottomPlate, [plateW, plateH, thick], 0.5);
verify.boundingBoxSize("top plate size",    topPlate,    [plateW, plateH, thick], 0.5);

// ✓  Plates are not empty
verify.notEmpty("bottom plate exists", bottomPlate);
verify.notEmpty("top plate exists",    topPlate);

// ✓  The top and bottom faces of each plate are parallel to each other
// Note: box face names are top, bottom, side-top, side-bottom, side-left, side-right
const bpTop    = bottomPlate.face("top");
const bpBottom = bottomPlate.face("bottom");
const bpSide   = bottomPlate.face("side-right");
const tpTop    = topPlate.face("top");

verify.parallel(
  "bottom plate top/bottom faces are parallel",
  bpTop,
  bpBottom,
);

// ✓  Top plate top face is parallel to bottom plate top face (horizontally aligned)
verify.parallel(
  "plates are parallel to each other",
  bpTop,
  tpTop,
);

// ✓  The side faces of the bottom plate are perpendicular to its top face
verify.perpendicular(
  "bottom plate: top ⊥ side-right",
  bpTop,
  bpSide,
);

// ✓  Plates do not collide (the gap between them should be gapZ = 20 mm)
verify.notColliding("plates don't collide", bottomPlate, topPlate, gapZ + thick + 5);

// ✓  Peg doesn't collide with bottom plate top face (it sits on top of it)
verify.notColliding("peg sits on plate, no collision", peg, bottomPlate, 1.0);

// ✓  Custom check: gap between plates is the expected value
const bb1 = bottomPlate.boundingBox();
const bb2 = topPlate.boundingBox();
const measuredGap = bb2.min[2] - bb1.max[2];
verify.equal("gap between plates", measuredGap, gapZ, 0.5);

// ✓  peg is centred over the bottom plate (bounding-box center XY match)
verify.that("peg is centred over bottom plate", () => {
  const bcx = (bb1.min[0] + bb1.max[0]) / 2;
  const bcy = (bb1.min[1] + bb1.max[1]) / 2;
  const pb  = peg.boundingBox();
  const pcx = (pb.min[0] + pb.max[0]) / 2;
  const pcy = (pb.min[1] + pb.max[1]) / 2;
  return Math.abs(pcx - bcx) < 0.5 && Math.abs(pcy - bcy) < 0.5;
}, "peg XY centre should match plate centre");

// ✗  INTENTIONAL FAILURE: the collider cube overlaps the bottom plate
verify.notColliding("collider must not overlap plate (WILL FAIL)", collider, bottomPlate, 5.0);

// ✗  INTENTIONAL FAILURE: wrong expected volume
verify.volumeApprox("peg volume sanity (WILL FAIL — too tight)", peg, 999, 1);

// ✗  INTENTIONAL FAILURE: custom range check
verify.inRange("gap is between 5 and 15 mm (WILL FAIL)", measuredGap, 5, 15,
  `Gap is ${measuredGap} mm but should be between 5 and 15 mm`);

// -----------------------------------------------------------------------
// Return the scene
// -----------------------------------------------------------------------

return [
  { name: "Bottom Plate",    shape: bottomPlate, color: "#5b9bd5" },
  { name: "Top Plate",       shape: topPlate,    color: "#5b9bd5" },
  { name: "Centre Peg",      shape: peg,         color: "#e07b39" },
  { name: "Collider (bad)",  shape: collider,    color: "#e05252" },
];

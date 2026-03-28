/**
 * Spec API demo — define named requirements and check shapes against them.
 *
 * Specs group related verify calls into collapsible sections in the Checks
 * panel. They are reusable (apply to multiple shapes) and composable.
 */

// ---------------------------------------------------------------------------
// 1. Define specs — what "good" looks like
// ---------------------------------------------------------------------------

const printable = spec("Fits Prusa MK3S bed", (shape) => {
  verify.notEmpty("Has geometry", shape);
  const bb = shape.boundingBox();
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  verify.lessThan("Width  < 220mm", size[0], 220);
  verify.lessThan("Depth  < 220mm", size[1], 220);
  verify.lessThan("Height < 250mm", size[2], 250);
});

const structural = spec("Structural integrity", (shape) => {
  verify.notEmpty("Has geometry", shape);
  const bb = shape.boundingBox();
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const minDim = Math.min(...size);
  verify.greaterThan("No degenerate axis (> 2mm)", minDim, 2);
  verify.greaterThan("Min bounding volume", size[0] * size[1] * size[2], 500);
});

const clearanceSpec = spec("Assembly clearance", (partA, partB) => {
  verify.notColliding("Parts don't intersect", partA, partB, 10);
  verify.minClearance("Min 0.5mm gap", partA, partB, 0.5, 10);
});

// ---------------------------------------------------------------------------
// 2. Build geometry
// ---------------------------------------------------------------------------

const bracket = box(80, 60, 8)
  .subtract(cylinder(20, 5, 5, 32).translate(20, 30, -1))
  .subtract(cylinder(20, 5, 5, 32).translate(60, 30, -1));

const standoff = cylinder(15, 4)
  .translate(20, 30, 8);

// ---------------------------------------------------------------------------
// 3. Check against specs
// ---------------------------------------------------------------------------

// Reuse the same spec on multiple shapes
printable.check(bracket);
printable.check(standoff);

// Single-shape spec
structural.check(bracket);
structural.check(standoff);

// Multi-shape spec
clearanceSpec.check(bracket, standoff);

// Plain verify calls still work — shown ungrouped below the spec sections
verify.greaterThan("Bracket wider than tall", 80, 8);

// ---------------------------------------------------------------------------
// 4. Return the scene
// ---------------------------------------------------------------------------

return [
  { name: "Bracket",  shape: bracket,  color: "#5b9bd5" },
  { name: "Standoff", shape: standoff, color: "#e07b39" },
];

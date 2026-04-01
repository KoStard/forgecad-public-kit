/**
 * Face Transformation History Demo
 *
 * Shows how to trace the transformation chain for each surface.
 */

const base = box(100, 60, 20, true)
  .translate(0, 0, 10)
  .rotate(0, 0, 15);

const withHole = base
  .hole('top', { diameter: 12, depth: 8, u: 20, v: 10 });

// Get the transformation history for the top face
const topHistory = withHole.faceHistory('top');

// Get history for the hole floor
const floorHistory = withHole.faceHistory('floor');

// Display the histories as dimensions for visibility
dim([0, 0, 0], [10, 0, 0], {
  label: `Top: ${topHistory.origin.operation} → ${topHistory.transformations.length} transforms`,
});

dim([0, 0, 0], [0, 10, 0], {
  label: `Floor: ${floorHistory.origin.operation} → ${floorHistory.transformations.length} transforms`,
});

// Also log to console for CLI output
console.log('=== Face Transformation History ===');
console.log('\nTop Face:');
console.log('  Origin:', topHistory.origin.operation);
console.log('  Transformations:');
topHistory.transformations.forEach((step, i) => {
  console.log(`    ${i + 1}. ${step.description}`);
});

console.log('\nHole Floor Face:');
console.log('  Origin:', floorHistory.origin.operation);
console.log('  Transformations:');
floorHistory.transformations.forEach((step, i) => {
  console.log(`    ${i + 1}. ${step.description}`);
});

return withHole;

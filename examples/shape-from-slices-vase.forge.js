/**
 * Vase with cross-section transitions + side-view envelope.
 *
 * Demonstrates Shape.fromSlices() with multiple slices in one direction
 * (XY cross-sections that get lofted) plus a constraining silhouette
 * in another direction (XZ envelope).
 */

// XY cross-sections at different heights
const bottom = circle2d(20);
const middle = rect(28, 28);
const neck = circle2d(10);
const rim = circle2d(12);

// XZ vase silhouette (constraining envelope)
const vaseProfile = polygon([
  [-22, 0],
  [-20, 5],
  [-18, 30],
  [-25, 40],
  [-25, 50],
  [-12, 70],
  [-10, 75],
  [-14, 80],
  [-14, 85],
  [14, 85],
  [14, 80],
  [10, 75],
  [12, 70],
  [25, 50],
  [25, 40],
  [18, 30],
  [20, 5],
  [22, 0],
]);

return Shape.fromSlices([
  // Cross-sections (lofted)
  { on: 'xy', at: 0, profile: bottom },
  { on: 'xy', at: 40, profile: middle },
  { on: 'xy', at: 70, profile: neck },
  { on: 'xy', at: 85, profile: rim },
  // Side view envelope
  { on: 'xz', at: 0, profile: vaseProfile },
]);

/**
 * Egg shape from two orthogonal silhouettes.
 *
 * Demonstrates Shape.fromSlices() with two single-slice groups:
 * - XZ plane: egg-shaped ellipse (side view)
 * - YZ plane: same ellipse (front view)
 * Boolean intersection of the two extruded silhouettes produces the egg.
 */

const eggProfile = ellipse(15, 25);

return Shape.fromSlices([
  { on: 'xz', at: 0, profile: eggProfile },
  { on: 'yz', at: 0, profile: eggProfile },
]);

// Variable Sweep test — tapered tube along a curved spine
// Demonstrates variableSweep() with different cross-sections at different t values

const spine = spline3d([
  [0, 0, 0],
  [20, 0, 10],
  [40, 10, 20],
  [60, 10, 30],
], { tension: 0.4 });

const smallCircle = circle2d(3, 24);
const largeCircle = circle2d(8, 24);

const tapered = variableSweep(spine, [
  { t: 0.0, profile: smallCircle },
  { t: 0.5, profile: largeCircle },
  { t: 1.0, profile: smallCircle },
], {
  edgeLength: 0.8,
  samples: 64,
});

return tapered.color('#8899aa');

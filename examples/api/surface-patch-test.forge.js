// Surface Patch test — smooth surface filling 4 boundary curves
// Demonstrates surfacePatch() using a saddle-like shape

const bottomCurve = spline3d([
  [0, 0, 0],
  [10, 0, 5],
  [20, 0, 3],
  [30, 0, 0],
], { tension: 0.3 });

const topCurve = spline3d([
  [0, 30, 0],
  [10, 30, -3],
  [20, 30, 2],
  [30, 30, 0],
], { tension: 0.3 });

const leftCurve = spline3d([
  [0, 0, 0],
  [0, 10, 4],
  [0, 20, 3],
  [0, 30, 0],
], { tension: 0.3 });

const rightCurve = spline3d([
  [30, 0, 0],
  [30, 10, -2],
  [30, 20, 1],
  [30, 30, 0],
], { tension: 0.3 });

const patch = surfacePatch({
  bottom: bottomCurve,
  top: topCurve,
  left: leftCurve,
  right: rightCurve,
}, {
  resolution: 20,
  thickness: 1.0,
});

return patch.color('#ccaa88');

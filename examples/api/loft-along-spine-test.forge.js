// Loft Along Spine test — wing-like shape transitioning profiles along a curved path
// Demonstrates loftAlongSpine() for placing different profiles along an arbitrary 3D curve

const spine = spline3d([
  [0, 0, 0],
  [30, 5, 5],
  [60, 15, 10],
  [80, 25, 8],
], { tension: 0.4 });

// Root profile — large rounded rectangle
const rootProfile = spline2d([
  [10, 3], [8, 5], [0, 6], [-8, 5], [-10, 3],
  [-10, -3], [-8, -5], [0, -6], [8, -5], [10, -3],
], { closed: true, tension: 0.4 });

// Mid profile — medium elliptical
const midProfile = spline2d([
  [7, 2], [5, 3.5], [0, 4], [-5, 3.5], [-7, 2],
  [-7, -2], [-5, -3.5], [0, -4], [5, -3.5], [7, -2],
], { closed: true, tension: 0.4 });

// Tip profile — small circle
const tipProfile = circle2d(2, 20);

const wing = loftAlongSpine(
  [rootProfile, midProfile, tipProfile],
  spine,
  [0.0, 0.5, 1.0],
  { edgeLength: 0.8, samples: 64 },
);

return wing.color('#aabbcc');

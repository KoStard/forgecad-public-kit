// Bracket profile — demonstrates the directional route API
//
// A zigzag bracket with three vertical sections connected by arcs,
// constrained by horizontal offsets between the verticals.

const sk = constrainedSketch();

const r = sk.route(0, 0);

// First vertical section
const v1 = r.up(18);

// Arcs transitioning to second vertical
r.arcLeft(8.9);
r.arcRight(2);

// Second vertical — length determined by constraints
const v2 = r.up();

// Arcs transitioning to third vertical
r.arcLeft(3, { minSweep: 150 });
r.arcRight(10);
r.arcLeft(5);

// Third vertical — length determined by constraints
const v3 = r.down();

// Bottom transition
r.arcRight(2);
r.arcLeft(7.7);

// Horizontal and vertical segments at the bottom
r.right(11.4);
r.up(4.2);
r.arcRight(5, 180);
r.down(4.2);
r.right(9.9);

r.done();

// Cross-segment constraints
sk.offsetX(v1, v2, -10.8);
sk.offsetX(v2, v3, -20.4);
sk.vDistance(r.endOf(v1), r.endOf(v2), 29);

return sk.solve();

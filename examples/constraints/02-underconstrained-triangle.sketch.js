// Underconstrained triangle — DOF > 0, status = "under"
// Demonstrates: equal sides but no position/angle lock
// Expected: blue status, triangle can still slide/rotate

const sk = constrainedSketch();

const p1 = sk.point(0, 0);
const p2 = sk.point(20, 0);
const p3 = sk.point(10, 17);

const l1 = sk.line(p1, p2);
const l2 = sk.line(p2, p3);
const l3 = sk.line(p3, p1);

sk.addLoop([p1, p2, p3]);

// Only constrain shape, not position
sk.equal(l1, l2);
sk.equal(l1, l3);
sk.length(l1, param("side", 20, { unit: "mm" }));

return sk.solve();

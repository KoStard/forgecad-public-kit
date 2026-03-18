// Redundant constraints — DOF < 0 but converged, status = "over-redundant"
// Demonstrates: horizontal + absoluteAngle(0) are equivalent — one is redundant
// Expected: orange status, redundant constraints highlighted

const sk = constrainedSketch();

const a = sk.point(0, 0, true);
const b = sk.point(10, 0);
const l = sk.line(a, b);

sk.addLoop([a, b, sk.point(10, 5), sk.point(0, 5)]);
sk.line(b, sk.point(10, 5));
sk.line(sk.point(10, 5), sk.point(0, 5));
sk.line(sk.point(0, 5), a);

// These two constraints say the same thing:
sk.horizontal(l);        // line must be horizontal
sk.absoluteAngle(l, 0);  // line must be at 0 degrees (= horizontal)

sk.length(l, param("length", 10, { unit: "mm" }));

return sk.solve();

// Redundant constraints — DOF < 0 but converged, status = "over-redundant"
// Demonstrates: horizontal + absoluteAngle(0) are equivalent — one is redundant
// Expected: orange "over-redundant" status, redundant constraints highlighted

const sk = constrainedSketch();

const a = sk.point(0, 0, true);
const b = sk.point(10, 0);
const c = sk.point(10, 5);
const d = sk.point(0, 5);

const lBottom = sk.line(a, b);
const lRight = sk.line(b, c);
const lTop = sk.line(c, d);
const lLeft = sk.line(d, a);

sk.addLoop([a, b, c, d]);

// These two constraints say the same thing:
sk.horizontal(lBottom);        // line must be horizontal
sk.absoluteAngle(lBottom, 0);  // line must be at 0 degrees (= horizontal)

// Fully constrain the rest
sk.vertical(lRight);
sk.vertical(lLeft);
sk.horizontal(lTop);
sk.length(lBottom, Param.number("width", 10, { unit: "mm" }));
sk.length(lRight, Param.number("height", 5, { unit: "mm" }));

return sk.solve();

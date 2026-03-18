// Symmetric L-bracket — symmetric constraint about a vertical axis
// Demonstrates: symmetric, fix, horizontal, vertical, length
// Expected: green "fully" status

const sk = constrainedSketch();

// Symmetry axis (construction line)
const axBot = sk.point(0, -5, true);
const axTop = sk.point(0, 45, true);
const axis = sk.line(axBot, axTop, true);
sk.fix(axBot);
sk.fix(axTop);
sk.vertical(axis);

// Left side of bracket
const bl = sk.point(-25, 0);
const ml = sk.point(-25, 20);
const tl = sk.point(-10, 20);
const ttl = sk.point(-10, 40);

// Right side (symmetric)
const br = sk.point(25, 0);
const mr = sk.point(25, 20);
const tr = sk.point(10, 20);
const ttr = sk.point(10, 40);

// Lines — full outline
const lBottom = sk.line(bl, br);
const lLeft = sk.line(bl, ml);
const lLeftTop = sk.line(ml, tl);
const lLeftUp = sk.line(tl, ttl);
const lTop = sk.line(ttl, ttr);
const lRightDown = sk.line(ttr, tr);
const lRightTop = sk.line(tr, mr);
const lRight = sk.line(mr, br);

// Closed loop
sk.addLoop([bl, br, mr, tr, ttr, ttl, tl, ml]);

sk.symmetric(bl, br, axis);
sk.symmetric(ml, mr, axis);
sk.symmetric(tl, tr, axis);
sk.symmetric(ttl, ttr, axis);

sk.horizontal(lBottom);
sk.vertical(lLeft);
sk.horizontal(lLeftTop);
sk.vertical(lLeftUp);

sk.length(lBottom, param("base_width", 50, { unit: "mm" }));
sk.length(lLeft, param("leg_height", 20, { unit: "mm" }));
sk.length(lLeftTop, param("step_width", 15, { unit: "mm" }));
sk.length(lLeftUp, param("top_height", 20, { unit: "mm" }));

return sk.solve();

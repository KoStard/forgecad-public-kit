// Fully constrained rectangle — DOF = 0, status = "fully"
// Demonstrates: fix, horizontal, vertical, parallel, length
// Expected: green status, all constraints satisfied

const sk = constrainedSketch();

const bl = sk.point(0, 0);
const br = sk.point(40, 0);
const tr = sk.point(40, 30);
const tl = sk.point(0, 30);

const bottom = sk.line(bl, br);
const right = sk.line(br, tr);
const top = sk.line(tr, tl);
const left = sk.line(tl, bl);

sk.addLoop([bl, br, tr, tl]);

sk.fix(bl);
sk.horizontal(bottom);
sk.vertical(right);
sk.parallel(bottom, top);
sk.parallel(right, left);
sk.length(bottom, Param.number("width", 40, { unit: "mm" }));
sk.length(right, Param.number("height", 30, { unit: "mm" }));

return sk.solve();

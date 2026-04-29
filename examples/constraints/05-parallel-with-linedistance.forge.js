// Parallel + lineDistance — lineDistance implies parallelism
// Demonstrates: lineDistance(a, b, d) forces lines a and b to be parallel
// at distance d. Adding explicit parallel() is redundant but not conflicting.
// Expected: orange "over-redundant" status — parallel constraint is redundant

const sk = constrainedSketch();

const p1 = sk.point(0, 0);
const p2 = sk.point(20, 0);
const p3 = sk.point(0, 10);
const p4 = sk.point(20, 10);

const bottom = sk.line(p1, p2);
const top = sk.line(p3, p4);
const left = sk.line(p1, p3);
const right = sk.line(p2, p4);

sk.addLoop([p1, p2, p4, p3]);

sk.fix(p1);
sk.horizontal(bottom);
sk.vertical(left);
sk.length(bottom, Param.number("width", 20, { unit: "mm" }));

// lineDistance already implies parallel:
sk.lineDistance(bottom, top, Param.number("height", 10, { unit: "mm" }));
sk.parallel(bottom, top);  // redundant — lineDistance already forces parallel

sk.parallel(left, right);
sk.equal(left, right);

return sk.solve();

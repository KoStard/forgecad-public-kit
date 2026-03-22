// Perpendicular chain — a zigzag of perpendicular lines
// Demonstrates: perpendicular, length, fix, absoluteAngle
// Expected: green "fully" status

const sk = constrainedSketch();

const p1 = sk.point(0, 0);
const p2 = sk.point(20, 0);
const p3 = sk.point(20, 15);
const p4 = sk.point(35, 15);
const p5 = sk.point(35, 0);

const l1 = sk.line(p1, p2);
const l2 = sk.line(p2, p3);
const l3 = sk.line(p3, p4);
const l4 = sk.line(p4, p5);

sk.fix(p1);
sk.absoluteAngle(l1, 0);
sk.perpendicular(l1, l2);
sk.perpendicular(l2, l3);
sk.perpendicular(l3, l4);
sk.length(l1, param("seg1", 20, { unit: "mm" }));
sk.length(l2, param("seg2", 15, { unit: "mm" }));
sk.length(l3, param("seg3", 15, { unit: "mm" }));
sk.length(l4, param("seg4", 15, { unit: "mm" }));

return sk.solve();

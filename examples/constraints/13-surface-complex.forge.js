// Surface selection — L-shape with diagonal divider
// Tests arrangement detection with non-rectangular regions.
// An L-shaped outline with a diagonal line creating triangular and trapezoidal faces.
// Expected: FULLY DOF=0, multiple surfaces with varying shapes and areas.

const sk = constrainedSketch();

const SIZE = Param.number("size", 60, { unit: "mm" });

// L-shape vertices (going CCW)
//   (0,60)────(60,60)
//     |          |
//     |   (30,30)┘
//     |     |
//   (0,0)──(30,0)

const p1 = sk.point(0, 0);     // bottom-left
const p2 = sk.point(30, 0);    // bottom-right
const p3 = sk.point(30, 30);   // inner corner
const p4 = sk.point(60, 30);   // right step
const p5 = sk.point(60, 60);   // top-right
const p6 = sk.point(0, 60);    // top-left

// L-shape outline
const l1 = sk.line(p1, p2);   // bottom
const l2 = sk.line(p2, p3);   // right-lower
const l3 = sk.line(p3, p4);   // step horizontal
const l4 = sk.line(p4, p5);   // right-upper
const l5 = sk.line(p5, p6);   // top
const l6 = sk.line(p6, p1);   // left

// Diagonal divider from bottom-left to inner corner
const diag = sk.line(p1, p3);

// Another diagonal from inner corner to top-right
const diag2 = sk.line(p3, p5);

// Constraints
sk.fix(p1);
sk.fix(p2, 30, 0);
sk.fix(p3, 30, 30);
sk.fix(p4, 60, 30);
sk.fix(p5, 60, 60);
sk.fix(p6, 0, 60);

return sk.solve();

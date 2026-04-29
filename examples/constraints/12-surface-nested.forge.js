// Surface selection — nested rectangles (frame + inner panel)
// Tests arrangement detection with concentric geometry.
// Expected: FULLY DOF=0, 2 surfaces — outer frame ring and inner rectangle.
// The frame area should be outer - inner = 12000 - 3000 = 9000mm²
// The inner area should be 3000mm² (60×50)

const sk = constrainedSketch();

const OW = Param.number("outer_w", 120, { unit: "mm" });
const OH = Param.number("outer_h", 100, { unit: "mm" });
const IW = Param.number("inner_w", 60, { unit: "mm" });
const IH = Param.number("inner_h", 50, { unit: "mm" });

// Outer rectangle
const o1 = sk.point(0, 0);
const o2 = sk.point(120, 0);
const o3 = sk.point(120, 100);
const o4 = sk.point(0, 100);

const oBot = sk.line(o1, o2);
const oRight = sk.line(o2, o3);
const oTop = sk.line(o3, o4);
const oLeft = sk.line(o4, o1);

// Inner rectangle (centered)
const i1 = sk.point(30, 25);
const i2 = sk.point(90, 25);
const i3 = sk.point(90, 75);
const i4 = sk.point(30, 75);

const iBot = sk.line(i1, i2);
const iRight = sk.line(i2, i3);
const iTop = sk.line(i3, i4);
const iLeft = sk.line(i4, i1);

// Connect inner to outer — we need lines bridging the two rectangles
// so the arrangement algorithm can detect the frame as a region.
// A vertical bridge from outer bottom to inner bottom:
const bridge = sk.line(o1, i1);

// Constraints
sk.fix(o1);
sk.horizontal(oBot);
sk.vertical(oRight);
sk.parallel(oBot, oTop);
sk.parallel(oRight, oLeft);
sk.length(oBot, OW);
sk.length(oRight, OH);

sk.horizontal(iBot);
sk.vertical(iRight);
sk.parallel(iBot, iTop);
sk.parallel(iRight, iLeft);
sk.length(iBot, IW);
sk.length(iRight, IH);

// Center inner rectangle in outer
sk.fix(i1, 30, 25);

return sk.solve();

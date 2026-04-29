// Surface selection — 3×2 grid with 6 cells
// Tests detectArrangement() surface detection from line arrangement.
// 12 points, 17 lines, 6 detected surfaces.
// Expected: FULLY DOF=0, 6 surfaces with areas ~2500mm² each.
// No addLoop() — uses detectArrangement() to find surfaces automatically.

const sk = constrainedSketch();

const W = Param.number("width", 150, { unit: "mm" });
const H = Param.number("height", 100, { unit: "mm" });

// Outer box corners
const p00 = sk.point(0, 0);
const p10 = sk.point(150, 0);
const p11 = sk.point(150, 100);
const p01 = sk.point(0, 100);

// Vertical divider endpoints at x=50, x=100
const v0b = sk.point(50, 0);
const v0t = sk.point(50, 100);
const v1b = sk.point(100, 0);
const v1t = sk.point(100, 100);

// Horizontal divider endpoints at y=50
const h0l = sk.point(0, 50);
const h0r = sk.point(150, 50);

// Outer boundary
sk.line(p00, v0b);
sk.line(v0b, v1b);
sk.line(v1b, p10);
const bRight = sk.line(p10, p11);
sk.line(p11, v1t);
sk.line(v1t, v0t);
sk.line(v0t, p01);
const bLeft = sk.line(p01, h0l);

// Left side split: p01→h0l and h0l→p00
sk.line(h0l, p00);

// Vertical dividers
sk.line(v0b, v0t);
sk.line(v1b, v1t);

// Horizontal divider (full width, split at vertical divider crossings)
// The arrangement algorithm handles X-crossings, so one line is fine
sk.line(h0l, h0r);

// Constraints — anchor + rectangle shape
sk.fix(p00);
sk.fix(p10, 150, 0);
sk.fix(p11, 150, 100);
sk.fix(p01, 0, 100);

// Vertical dividers at 1/3 and 2/3 width
sk.fix(v0b, 50, 0);
sk.fix(v0t, 50, 100);
sk.fix(v1b, 100, 0);
sk.fix(v1t, 100, 100);

// Horizontal divider at 1/2 height
sk.fix(h0l, 0, 50);
sk.fix(h0r, 150, 50);

return sk.solve();

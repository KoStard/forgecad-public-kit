// Conflicting constraints — impossible to satisfy, status = "over"
// Demonstrates: a line cannot be both 10mm and 20mm long
// Expected: red status, conflicting constraints highlighted

const sk = constrainedSketch();

const a = sk.point(0, 0);
const b = sk.point(10, 0);
const l = sk.line(a, b);

sk.fix(a);
sk.horizontal(l);

// These two constraints conflict:
sk.length(l, 10);  // line must be 10mm
sk.length(l, 20);  // line must be 20mm — impossible!

return sk.solve();

// Quick test: all three curve features
const r = 15;

// Test 1: S-curve with arcTo
const test1 = (() => {
  const sk = constrainedSketch();
  sk.moveTo(0, 0);
  sk.arcTo(r, r, r, false);
  sk.arcTo(0, 2 * r, r, true);
  sk.close();
  return sk.solve().extrude(5);
})();

// Test 2: bezierTo bottle profile
const test2 = (() => {
  const sk = constrainedSketch();
  sk.moveTo(0, 0);
  sk.lineTo(30, 0);
  sk.bezierTo(38, 10, 22, 20, 30, 30);
  sk.lineTo(0, 30);
  sk.close();
  return sk.solve().extrude(5).translate(40, 0, 0);
})();

// Test 3: blendTo from arc to point
const test3 = (() => {
  const sk = constrainedSketch();
  sk.moveTo(0, 0);
  sk.arcTo(r, r, r, false);
  sk.blendTo(r + 25, r + 8);
  sk.lineTo(r + 25, 0);
  sk.close();
  return sk.solve().extrude(5).translate(70, 0, 0);
})();

return [test1, test2, test3];

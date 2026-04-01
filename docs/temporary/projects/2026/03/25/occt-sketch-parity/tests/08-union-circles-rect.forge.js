// Test 8: Union of overlapping shapes (hook profile pattern from lock)
const body = rect(20, 30, true);
const topCap = circle2d(12);
const bottomCap = circle2d(12).translate(0, -30);
return union2d(body, topCap, bottomCap).extrude(4);

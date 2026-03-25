// Test 6: Rounded rect with multiple circle holes (like cassette)
return difference2d(
  roundedRect(40, 30, 5, true),
  circle2d(6).translate(-10, 0),
  circle2d(6).translate(10, 0)
).extrude(5);

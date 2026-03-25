// Test 10: Minimal cassette reproduction
const cassette2d = difference2d(
  roundedRect(72, 46, 8, true),
  circle2d(9).translate(-16, 0),
  circle2d(9).translate(16, 0),
  slot(18, 14),
  slot(24, 8).translate(0, -13)
);
return cassette2d.extrude(8);

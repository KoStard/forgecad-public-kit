// Test 9: Union then difference (simplified lock arm)
const body = rect(20, 30, true);
const topCap = circle2d(12);
const bottomCap = circle2d(12).translate(0, -30);
let profile = union2d(body, topCap, bottomCap);
profile = difference2d(profile, circle2d(5), circle2d(5).translate(0, -30));
return profile.extrude(4);

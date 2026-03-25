// Test 11: Union → difference → union → difference (lock arm pattern)
// Step 1: Hook profile — union of rect + 2 circles
const body = rect(20, 30, true);
const topCap = circle2d(12);
const bottomCap = circle2d(12).translate(0, -30);
let profile = union2d(body, topCap, bottomCap);

// Step 2: Subtract pivot and catch holes
const pivotHole = circle2d(5);
const catchHole = circle2d(5).translate(0, -30);
profile = difference2d(profile, pivotHole, catchHole);

// Step 3: Subtract entry slot (rect + triangle)
const slotBody = rect(20, 10, true).translate(15, -30);
profile = difference2d(profile, slotBody);

// Step 4: Add detent bumps (small circles)
const detentTop = circle2d(2).translate(4, -25);
const detentBottom = circle2d(2).translate(4, -35);
profile = union2d(profile, detentTop, detentBottom);

// Step 5: Re-subtract catch hole to clear detent overlap
profile = difference2d(profile, catchHole);

return profile.extrude(4);

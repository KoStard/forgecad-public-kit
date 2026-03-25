// Minimal: union then diff with rect extending outside boundary
let profile = union2d(rect(20, 30, true), circle2d(12), circle2d(12).translate(0, -30));
// This rect extends far to the right, partially outside the profile
profile = difference2d(profile, rect(20, 10, true).translate(15, -30));
return profile.extrude(4);

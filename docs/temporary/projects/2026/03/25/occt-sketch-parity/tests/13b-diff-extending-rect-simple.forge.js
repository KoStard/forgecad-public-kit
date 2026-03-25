// Even simpler: circle with diff of rect extending outside
let profile = circle2d(10);
// This rect extends outside the circle
profile = difference2d(profile, rect(10, 5, true).translate(8, 0));
return profile.extrude(4);

let t = 5;
let plateA = box(40, 30, t);
let plateB = box(t, 30, 40).translate(0, 0, 20 - t / 2);

let bracket = union(plateA, plateB);

let hole1 = cylinder(t + 2, 6.5 / 2, 6.5 / 2, 48, true)
  .rotate(90, 0, 0)
  .translate(20, 15, 0);

let hole2 = cylinder(t + 2, 6.5 / 2, 6.5 / 2, 48, true)
  .rotate(0, 90, 0)
  .translate(0, 15, 20);

bracket = difference(bracket, hole1, hole2);

return bracket;
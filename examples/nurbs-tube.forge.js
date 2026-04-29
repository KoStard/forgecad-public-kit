// NURBS curve swept into a smooth tube
const curve = nurbs3d(
  [[0,0,0], [15,8,0], [25,-3,10], [40,5,15], [50,0,5]],
  { degree: 3 }
);
const tube = sweep(circle2d(2), curve);
return tube;

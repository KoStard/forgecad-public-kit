// Freeform NURBS surface — a gently curved panel
const grid = [
  [[0,0,0],  [10,0,2],  [20,0,2],  [30,0,0]],
  [[0,10,1], [10,10,6], [20,10,6], [30,10,1]],
  [[0,20,1], [10,20,6], [20,20,6], [30,20,1]],
  [[0,30,0], [10,30,2], [20,30,2], [30,30,0]],
];
return nurbsSurface(grid, { thickness: 1.5 });

// Test lib.elbow() — pipe bend primitive
const pipeR = param("Pipe Radius", 5, { min: 2, max: 15, unit: "mm" });
const bendR = param("Bend Radius", 25, { min: 10, max: 60, unit: "mm" });
const angle = param("Angle", 90, { min: 15, max: 180, unit: "°" });

// Basic elbow at default orientation
const basic = lib.elbow(pipeR, bendR, angle).color('#B87333');

// Elbow with from/to directions
const oriented = lib.elbow(pipeR, bendR, {
  from: [0, 0, 1],
  to: [1, 0, 0],
}).translate(80, 0, 0).color('#4488cc');

// Hollow elbow
const hollow = lib.elbow(pipeR, bendR, angle, { wall: 1.5 })
  .translate(0, 80, 0).color('#888888');

return [
  { name: "Basic 90° Elbow", shape: basic },
  { name: "Oriented Elbow (Z→X)", shape: oriented },
  { name: "Hollow Elbow", shape: hollow },
];

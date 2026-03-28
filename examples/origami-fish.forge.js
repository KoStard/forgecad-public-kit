// Origami Fish
// Stylized folded-paper fish inspired by a side-view crane-fish form.

const scale = param("Scale", 1.25, { min: 0.7, max: 1.9, step: 0.05 });
const paper = param("Paper Thickness", 0.9, { min: 0.4, max: 2, step: 0.05, unit: "mm" });
const fold = param("Fold", 30, { min: 0, max: 65, unit: "°" });
const tailSpread = param("Tail Spread", 34, { min: 10, max: 70, unit: "°" });
const tailDrop = param("Tail Drop", 26, { min: 0, max: 55, unit: "°" });
const showStand = param("Show Stand", 1, { min: 0, max: 1, integer: true });

const redMain = "#c51f3a";
const redLight = "#d8324f";
const redShadow = "#9f1730";

const S = (v) => v * scale;
const toPts = (pts) => pts.map(([x, y]) => [S(x), S(y)]);

function pose(shape) {
  return shape.rotate(14, -8, 20).translate(S(6), S(0), S(36));
}

function panel(name, pts, color, rotate = [0, 0, 0], translate = [0, 0, 0]) {
  const shape = polygon(toPts(pts))
    .extrude(paper, { center: true })
    .color(color)
    .rotate(rotate[0], rotate[1], rotate[2])
    .translate(S(translate[0]), S(translate[1]), S(translate[2]));
  return { name, shape: pose(shape) };
}

function ridge(name, pts, width, color, rotate = [0, 0, 0], translate = [0, 0, 0]) {
  const shape = stroke(toPts(pts), S(width), "Round")
    .extrude(paper * 0.9, { center: true })
    .color(color)
    .rotate(rotate[0], rotate[1], rotate[2])
    .translate(S(translate[0]), S(translate[1]), S(translate[2]));
  return { name, shape: pose(shape) };
}

const fish = [
  panel(
    "Body Panel",
    [[-54, -10], [-30, -22], [6, -18], [36, -6], [42, 8], [20, 20], [-16, 24], [-46, 10]],
    redMain,
    [6, -fold * 0.18, 3]
  ),
  panel(
    "Dorsal Fold",
    [[-34, 8], [-10, 22], [20, 16], [36, 6], [12, 8], [-14, 12]],
    redLight,
    [10, fold * 0.24, 8],
    [-2, 2, 2]
  ),
  panel(
    "Belly Fold",
    [[-30, -8], [-8, -20], [24, -12], [32, -3], [12, -2], [-14, -6]],
    redShadow,
    [-11, -fold * 0.2, -5],
    [-2, -2, -2]
  ),
  panel(
    "Head Flap",
    [[18, 0], [34, 8], [54, 4], [60, -6], [40, -12], [24, -8]],
    redLight,
    [4, fold * 0.16, 16],
    [1, 1, 1]
  ),
  panel(
    "Mouth Flap",
    [[30, -6], [44, -4], [49, -9], [40, -14], [31, -12]],
    redShadow,
    [-8, fold * 0.12, -4],
    [0, -1, -2]
  ),
  panel(
    "Main Tail Wing",
    [[-84, -34], [-72, -8], [-48, 8], [-46, -24]],
    redMain,
    [-tailDrop * 0.45, -tailSpread * 0.45, -8],
    [-8, -4, -2]
  ),
  panel(
    "Rear Fin",
    [[-74, 15], [-62, 5], [-44, 8], [-50, 20]],
    redLight,
    [tailDrop * 0.15, tailSpread * 0.35, 6],
    [-2, 4, 0]
  ),
  panel(
    "Top Fin",
    [[-8, 16], [8, 30], [20, 22], [4, 12]],
    redLight,
    [22, fold * 0.12, 4],
    [-4, 2, 6]
  ),
  panel(
    "Ventral Fin A",
    [[-4, -10], [6, -22], [18, -16], [6, -8]],
    redShadow,
    [-30, -8, -9],
    [9, -6, -7]
  ),
  panel(
    "Ventral Fin B",
    [[2, -8], [12, -18], [22, -12], [10, -5]],
    redShadow,
    [-24, 5, 6],
    [4, -5, -6]
  ),
  ridge(
    "Crease Spine",
    [[-40, -5], [-18, -2], [6, 4], [18, 7]],
    0.9,
    "#8e0f27",
    [2, 4, 4],
    [-1, -1, 0]
  ),
  ridge(
    "Crease Tail",
    [[-58, -13], [-52, -16], [-46, -18]],
    1.0,
    "#8a0f26",
    [-4, -4, -4],
    [-4, -5, -2]
  ),
];

if (showStand === 1) {
  const pin = cylinder(S(100), S(0.95))
    .color("#6f6f77")
    .translate(S(0), S(-4), S(-52));

  const clip = cylinder(S(7), S(2.6), S(1.2), 28, true)
    .pointAlong([0, 1, 0])
    .color("#56565d")
    .translate(S(1), S(-4), S(34));

  fish.push({ name: "Display Pin", shape: pin });
  fish.push({ name: "Display Clip", shape: clip });
}

return fish;

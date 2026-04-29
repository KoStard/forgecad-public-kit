// Compare common sketch-rounding strategies on the same roof profile.
// Only the selective fillet keeps the lower roof corners sharp.

const radius = Param.number("Radius", 14, { min: 4, max: 24, unit: "mm" });
const gap = 120;
const bodyWidth = 90;
const bodyHeight = 44;
const shoulderInset = 24;
const shoulderRise = 30;
const peakRise = 42;

const roofPoints = [
  [0, 0],
  [bodyWidth, 0],
  [bodyWidth, bodyHeight],
  [bodyWidth - shoulderInset, bodyHeight + shoulderRise],
  [bodyWidth / 2, bodyHeight + peakRise],
  [shoulderInset, bodyHeight + shoulderRise],
  [0, bodyHeight],
];

const roofRidge = [
  [0, bodyHeight],
  [shoulderInset, bodyHeight + shoulderRise],
  [bodyWidth / 2, bodyHeight + peakRise],
  [bodyWidth - shoulderInset, bodyHeight + shoulderRise],
  [bodyWidth, bodyHeight],
];

const rawProfile = polygon(roofPoints).color('#7b858c');
const roundedAllCorners = rawProfile.offset(-radius, 'Round').offset(radius, 'Round').color('#d4862d');
const strokedCenterline = union2d(
  rect(bodyWidth, bodyHeight),
  stroke(roofRidge, radius * 2, 'Round'),
).color('#2a9d8f');
const mergedCircles = union2d(
  rect(bodyWidth, bodyHeight),
  union2d(
    circle2d(radius).translate(shoulderInset, bodyHeight + shoulderRise),
    circle2d(radius).translate(bodyWidth / 2, bodyHeight + peakRise),
    circle2d(radius).translate(bodyWidth - shoulderInset, bodyHeight + shoulderRise),
  ),
).color('#7f5af0');
const selectiveFillet = filletCorners(roofPoints, [
  { index: 3, radius },
  { index: 4, radius },
  { index: 5, radius },
]).color('#e63946');

return [
  { name: "Raw polygon", sketch: rawProfile },
  { name: "offset(-r).offset(+r)", sketch: roundedAllCorners.translate(gap, 0) },
  { name: "stroke(..., 'Round')", sketch: strokedCenterline.translate(gap * 2, 0) },
  { name: "union2d() of circles", sketch: mergedCircles.translate(gap * 3, 0) },
  { name: "filletCorners()", sketch: selectiveFillet.translate(gap * 4, 0) },
];

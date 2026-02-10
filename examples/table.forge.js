// Four-Legged Table — parametric dining/work table

const topW = param("Top Width", 120, { min: 60, max: 200, unit: "mm" });
const topD = param("Top Depth", 80, { min: 40, max: 150, unit: "mm" });
const topH = param("Top Thickness", 4, { min: 2, max: 10, unit: "mm" });
const tableH = param("Table Height", 75, { min: 50, max: 110, unit: "mm" });
const legSide = param("Leg Width", 5, { min: 3, max: 12, unit: "mm" });
const inset = param("Leg Inset", 5, { min: 0, max: 20, unit: "mm" });
const stretcher = param("Stretcher", 1, { min: 0, max: 1, step: 1 });
const stretcherH = param("Stretcher Height", 15, { min: 5, max: 40, unit: "mm" });
const stretcherW = param("Stretcher Width", 3, { min: 1, max: 6, unit: "mm" });

const legH = tableH - topH;

// Tabletop
const top = box(topW, topD, topH).translate(0, 0, legH);

// Leg positions: inset from each corner
const legPositions = [
  [inset, inset],
  [topW - inset - legSide, inset],
  [inset, topD - inset - legSide],
  [topW - inset - legSide, topD - inset - legSide],
];

const legs = union(
  ...legPositions.map(([x, y]) =>
    box(legSide, legSide, legH).translate(x, y, 0)
  )
);

// Optional stretchers between legs (long sides)
const parts = [top, legs];

if (stretcher >= 1) {
  const strLen = topD - 2 * inset - 2 * legSide + stretcherW;
  const leftStr = box(stretcherW, strLen, stretcherW)
    .translate(inset + legSide / 2 - stretcherW / 2, inset + legSide, stretcherH);
  const rightStr = box(stretcherW, strLen, stretcherW)
    .translate(topW - inset - legSide / 2 - stretcherW / 2, inset + legSide, stretcherH);
  parts.push(leftStr, rightStr);
}

return union(...parts);

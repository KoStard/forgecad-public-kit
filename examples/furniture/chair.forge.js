// Four-Legged Chair — parametric dining chair

const seatW = Param.number("Seat Width", 45, { min: 30, max: 60, unit: "mm" });
const seatD = Param.number("Seat Depth", 42, { min: 30, max: 55, unit: "mm" });
const seatT = Param.number("Seat Thickness", 3, { min: 2, max: 6, unit: "mm" });
const seatH = Param.number("Seat Height", 45, { min: 35, max: 55, unit: "mm" });

const legW = Param.number("Leg Width", 4, { min: 2, max: 8, unit: "mm" });
const legInset = Param.number("Leg Inset", 3, { min: 0, max: 10, unit: "mm" });

const backH = Param.number("Back Height", 40, { min: 25, max: 60, unit: "mm" });
const backT = Param.number("Back Thickness", 3, { min: 2, max: 6, unit: "mm" });
const backTilt = Param.number("Back Tilt", 5, { min: 0, max: 15, unit: "°" });

const stretcher = Param.number("Stretchers", 1, { min: 0, max: 1, step: 1 });
const stretcherH = Param.number("Stretcher Height", 12, { min: 5, max: 30, unit: "mm" });
const stretcherW = Param.number("Stretcher Width", 2, { min: 1, max: 4, unit: "mm" });

// --- Seat ---
const seat = box(seatW, seatD, seatT).translate(0, 0, seatH);

// --- Legs ---
const legPositions = [
  [legInset, legInset],                              // front-left
  [seatW - legInset - legW, legInset],               // front-right
  [legInset, seatD - legInset - legW],               // back-left
  [seatW - legInset - legW, seatD - legInset - legW] // back-right
];

const legs = union(
  ...legPositions.map(([x, y]) =>
    box(legW, legW, seatH).translate(x, y, 0)
  )
);

// --- Backrest ---
// Tilted slightly backward — rotate around X then position at back edge
const backPanel = box(seatW, backT, backH)
  .translate(-seatW / 2, -backT / 2, 0)  // center for rotation
  .rotateX(-backTilt)
  .translate(seatW / 2, seatD - legInset - legW / 2, seatH + seatT);

// --- Stretchers (side rails between legs) ---
const parts = [seat, legs, backPanel];

if (stretcher >= 1) {
  // Side stretchers (along Y, connecting front-back legs)
  const sideLen = seatD - 2 * legInset - legW;
  const leftStr = box(stretcherW, sideLen, stretcherW)
    .translate(legInset + legW / 2 - stretcherW / 2, legInset + legW, stretcherH);
  const rightStr = box(stretcherW, sideLen, stretcherW)
    .translate(seatW - legInset - legW / 2 - stretcherW / 2, legInset + legW, stretcherH);

  // Front stretcher (along X, connecting front legs)
  const frontLen = seatW - 2 * legInset - legW;
  const frontStr = box(frontLen, stretcherW, stretcherW)
    .translate(legInset + legW, legInset + legW / 2 - stretcherW / 2, stretcherH);

  parts.push(leftStr, rightStr, frontStr);
}

return union(...parts);

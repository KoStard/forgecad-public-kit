const squareSize = Param.number("Square Size", 36, { min: 24, max: 54, unit: "mm" });
const boardThickness = Param.number("Board Thickness", 14, { min: 8, max: 24, unit: "mm" });
const borderWidth = Param.number("Border Width", 10, { min: 4, max: 18, unit: "mm" });
const tileHeight = Param.number("Tile Height", 1.8, { min: 0.8, max: 4, step: 0.1, unit: "mm" });
const pieceScale = Param.number("Piece Scale", 1, { min: 0.8, max: 1.25, step: 0.01 });
const pieceLift = Param.number("Piece Lift", 0, { min: 0, max: 16, unit: "mm" });

const boardSize = squareSize * 8;
const frameSize = boardSize + borderWidth * 2;
const boardTop = boardThickness;
const pieceZ = boardTop + tileHeight + 0.25 + pieceLift;

const woodDark = "#4b2f1f";
const woodMid = "#7b5a3b";
const woodLight = "#d7be96";
const squareDark = "#7f5a3e";
const whitePiece = "#f1eadf";
const blackPiece = "#2b2a29";
const accentMetal = "#c7a86a";

function ring(height, outerRadius, innerRadius) {
  return cylinder(height, outerRadius).subtract(
    cylinder(height + 2, innerRadius).translate(0, 0, -1)
  );
}

function pieceBase(baseRadius, footHeight) {
  return union(
    cylinder(footHeight, baseRadius),
    cylinder(footHeight * 0.45, baseRadius * 0.8).translate(0, 0, footHeight),
    ring(footHeight * 0.28, baseRadius * 0.78, baseRadius * 0.55).translate(0, 0, footHeight * 1.45)
  );
}

function pawnShape() {
  const base = pieceBase(squareSize * 0.29, squareSize * 0.11);
  const stem = cylinder(squareSize * 0.36, squareSize * 0.11, squareSize * 0.09)
    .translate(0, 0, squareSize * 0.18);
  const collar = ring(squareSize * 0.05, squareSize * 0.16, squareSize * 0.11)
    .translate(0, 0, squareSize * 0.48);
  const body = sphere(squareSize * 0.18).translate(0, 0, squareSize * 0.58);
  const neck = cylinder(squareSize * 0.08, squareSize * 0.09).translate(0, 0, squareSize * 0.7);
  const head = sphere(squareSize * 0.14).translate(0, 0, squareSize * 0.88);
  return union(base, stem, collar, body, neck, head);
}

function rookShape() {
  const base = pieceBase(squareSize * 0.31, squareSize * 0.12);
  const lowerBody = cylinder(squareSize * 0.15, squareSize * 0.2, squareSize * 0.17)
    .translate(0, 0, squareSize * 0.19);
  const tower = cylinder(squareSize * 0.45, squareSize * 0.16)
    .translate(0, 0, squareSize * 0.34);
  const crown = cylinder(squareSize * 0.17, squareSize * 0.23)
    .translate(0, 0, squareSize * 0.79);
  const slot = box(squareSize * 0.08, squareSize * 0.18, squareSize * 0.14)
    .translate(0, squareSize * 0.18, squareSize * 0.88);
  const battlements = crown.subtract(circularPattern(slot, 4));
  return union(base, lowerBody, tower, battlements);
}

function bishopShape() {
  const base = pieceBase(squareSize * 0.31, squareSize * 0.12);
  const lowerBody = cylinder(squareSize * 0.16, squareSize * 0.21, squareSize * 0.16)
    .translate(0, 0, squareSize * 0.18);
  const body = cylinder(squareSize * 0.5, squareSize * 0.15, squareSize * 0.08)
    .translate(0, 0, squareSize * 0.34);
  const head = sphere(squareSize * 0.15).translate(0, 0, squareSize * 0.93);
  const crown = ring(squareSize * 0.05, squareSize * 0.16, squareSize * 0.11)
    .translate(0, 0, squareSize * 0.74);
  const piece = union(base, lowerBody, body, crown, head);
  const slit = box(squareSize * 0.06, squareSize * 0.28, squareSize * 0.42)
    .rotateZ(32)
    .translate(0, 0, squareSize * 0.86);
  return piece.subtract(slit);
}

function queenShape() {
  const base = pieceBase(squareSize * 0.33, squareSize * 0.12);
  const lowerBody = cylinder(squareSize * 0.18, squareSize * 0.22, squareSize * 0.17)
    .translate(0, 0, squareSize * 0.19);
  const body = cylinder(squareSize * 0.56, squareSize * 0.17, squareSize * 0.08)
    .translate(0, 0, squareSize * 0.37);
  const shoulder = sphere(squareSize * 0.11).translate(0, 0, squareSize * 0.92);
  const crownBand = ring(squareSize * 0.045, squareSize * 0.19, squareSize * 0.12)
    .translate(0, 0, squareSize * 1.02);
  const orb = sphere(squareSize * 0.09).translate(0, 0, squareSize * 1.12);

  const crownRadius = squareSize * 0.17;
  const crownBall = sphere(squareSize * 0.05).translate(crownRadius, 0, squareSize * 1.08);
  const crownBalls = circularPattern(crownBall, 6);

  return union(base, lowerBody, body, shoulder, crownBand, crownBalls, orb);
}

function kingShape() {
  const base = pieceBase(squareSize * 0.34, squareSize * 0.12);
  const lowerBody = cylinder(squareSize * 0.18, squareSize * 0.22, squareSize * 0.18)
    .translate(0, 0, squareSize * 0.19);
  const body = cylinder(squareSize * 0.58, squareSize * 0.17, squareSize * 0.09)
    .translate(0, 0, squareSize * 0.37);
  const shoulder = sphere(squareSize * 0.12).translate(0, 0, squareSize * 0.94);
  const neck = cylinder(squareSize * 0.08, squareSize * 0.08).translate(0, 0, squareSize * 1.04);
  const crossStem = box(squareSize * 0.055, squareSize * 0.055, squareSize * 0.22)
    .translate(0, 0, squareSize * 1.2);
  const crossArm = box(squareSize * 0.18, squareSize * 0.05, squareSize * 0.05)
    .translate(0, 0, squareSize * 1.23);
  return union(base, lowerBody, body, shoulder, neck, crossStem, crossArm);
}

function knightShape() {
  const base = pieceBase(squareSize * 0.32, squareSize * 0.12);
  const chest = sphere(squareSize * 0.18).translate(0, 0, squareSize * 0.45);
  const neck = union(
    sphere(squareSize * 0.14).translate(0, 0, squareSize * 0.62),
    sphere(squareSize * 0.12).translate(0, squareSize * 0.08, squareSize * 0.82),
    sphere(squareSize * 0.1).translate(0, squareSize * 0.12, squareSize * 1.02)
  );
  const head = union(
    sphere(squareSize * 0.11).translate(0, squareSize * 0.12, squareSize * 1.02),
    sphere(squareSize * 0.08).translate(0, squareSize * 0.22, squareSize * 0.98),
    sphere(squareSize * 0.07).translate(0, squareSize * 0.18, squareSize * 1.14)
  );
  const muzzle = union(
    sphere(squareSize * 0.055).translate(0, squareSize * 0.24, squareSize * 0.98),
    sphere(squareSize * 0.045).translate(0, squareSize * 0.31, squareSize * 0.94)
  );
  const mane = box(squareSize * 0.08, squareSize * 0.12, squareSize * 0.36)
    .rotateX(-12)
    .translate(0, squareSize * 0.03, squareSize * 0.94);
  const earL = box(squareSize * 0.035, squareSize * 0.08, squareSize * 0.12)
    .rotateX(-18).rotateZ(14)
    .translate(-squareSize * 0.04, squareSize * 0.18, squareSize * 1.2);
  const earR = box(squareSize * 0.035, squareSize * 0.08, squareSize * 0.12)
    .rotateX(-18).rotateZ(-14)
    .translate(squareSize * 0.04, squareSize * 0.18, squareSize * 1.2);
  const chinCut = box(squareSize * 0.5, squareSize * 0.28, squareSize * 0.34)
    .rotateX(58)
    .translate(0, -squareSize * 0.04, squareSize * 0.93);
  return union(base, chest, neck, head, muzzle, mane, earL, earR).subtract(chinCut);
}

function makePiece(kind) {
  if (kind === "pawn") return pawnShape();
  if (kind === "rook") return rookShape();
  if (kind === "knight") return knightShape();
  if (kind === "bishop") return bishopShape();
  if (kind === "queen") return queenShape();
  return kingShape();
}

function squareCenter(file, rank) {
  return [
    (file - 3.5) * squareSize,
    (rank - 3.5) * squareSize,
  ];
}

function placePiece(kind, file, rank, color, facingDeg, name) {
  const [x, y] = squareCenter(file, rank);
  const shape = makePiece(kind)
    .scale(pieceScale)
    .rotateZ(facingDeg)
    .translate(x, y, pieceZ)
    .color(color);
  return { name, shape };
}

const frame = difference(
  box(frameSize, frameSize, boardThickness).translate(0, 0, boardThickness * 0.5),
  box(boardSize + 1, boardSize + 1, boardThickness * 0.32)
    .translate(0, 0, boardThickness - boardThickness * 0.16)
)
  .color(woodDark);

const lightSquares = [];
const darkSquares = [];
for (let file = 0; file < 8; file += 1) {
  for (let rank = 0; rank < 8; rank += 1) {
    const [x, y] = squareCenter(file, rank);
    const tile = box(squareSize, squareSize, tileHeight)
      .translate(x, y, boardTop + tileHeight * 0.5);
    if ((file + rank) % 2 === 0) lightSquares.push(tile);
    else darkSquares.push(tile);
  }
}

const lightSquareField = union(...lightSquares).color(woodLight);
const darkSquareField = union(...darkSquares).color(squareDark);

const trim = difference(
  box(frameSize - borderWidth * 0.45, frameSize - borderWidth * 0.45, tileHeight * 0.9)
    .translate(0, 0, boardTop + tileHeight * 0.45),
  box(boardSize + borderWidth * 0.2, boardSize + borderWidth * 0.2, tileHeight * 2)
    .translate(0, 0, boardTop + tileHeight * 0.45)
).color(woodMid);

const cornerCap = sphere(borderWidth * 0.26)
  .translate(boardSize * 0.5 + borderWidth * 0.72, boardSize * 0.5 + borderWidth * 0.72, boardThickness + borderWidth * 0.38);
const cornerCaps = union(
  cornerCap,
  cornerCap.mirrorThrough([0, 0, 0], [1, 0, 0]),
  cornerCap.mirrorThrough([0, 0, 0], [0, 1, 0]),
  cornerCap.mirrorThrough([0, 0, 0], [1, 0, 0]).mirrorThrough([0, 0, 0], [0, 1, 0])
).color(accentMetal);

const whiteBackRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const blackBackRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

const whitePieces = [];
const blackPieces = [];

for (let file = 0; file < 8; file += 1) {
  whitePieces.push(placePiece("pawn", file, 1, whitePiece, 0, `White Pawn ${file + 1}`));
  blackPieces.push(placePiece("pawn", file, 6, blackPiece, 180, `Black Pawn ${file + 1}`));
}

for (let file = 0; file < 8; file += 1) {
  const whiteKind = whiteBackRank[file];
  const blackKind = blackBackRank[file];
  whitePieces.push(placePiece(whiteKind, file, 0, whitePiece, 0, `White ${whiteKind[0].toUpperCase()}${whiteKind.slice(1)} ${file + 1}`));
  blackPieces.push(placePiece(blackKind, file, 7, blackPiece, 180, `Black ${blackKind[0].toUpperCase()}${blackKind.slice(1)} ${file + 1}`));
}

return [
  { name: "Frame", shape: frame },
  { name: "Light Squares", shape: lightSquareField },
  { name: "Dark Squares", shape: darkSquareField },
  { name: "Trim Ring", shape: trim },
  { name: "Corner Caps", shape: cornerCaps },
  { name: "White Pieces", group: whitePieces },
  { name: "Black Pieces", group: blackPieces },
];

// Shoe Rack with Sitting Area — 2-level shelves + padded seat on top
//
// Structure: two side panels, bottom board, 2 shelves, top board,
// back panel for rigidity, and a cushion on top for sitting.

const width = Param.number("Width", 800, { min: 500, max: 1200, unit: "mm" });
const depth = Param.number("Depth", 350, { min: 250, max: 500, unit: "mm" });
const totalH = Param.number("Total Height", 500, { min: 350, max: 650, unit: "mm" });

const boardT = Param.number("Board Thickness", 18, { min: 12, max: 25, unit: "mm" });

const seatPad = Param.number("Seat Padding", 30, { min: 15, max: 60, unit: "mm" });
const seatOverhang = Param.number("Seat Overhang", 10, { min: 0, max: 30, unit: "mm" });

const divider = Param.number("Center Divider", 1, { min: 0, max: 1, step: 1 });

// Derived
const innerW = width - 2 * boardT;
const shelfCount = 2;
const shelfSpacing = (totalH - boardT) / (shelfCount + 1);

// --- Side panels ---
const leftPanel = box(boardT, depth, totalH);
const rightPanel = box(boardT, depth, totalH).translate(width - boardT, 0, 0);

// --- Bottom board ---
const bottom = box(innerW, depth, boardT).translate(boardT, 0, 0);

// --- Shelves ---
const shelves = [];
for (let i = 1; i <= shelfCount; i++) {
  shelves.push(
    box(innerW, depth, boardT).translate(boardT, 0, i * shelfSpacing)
  );
}

// --- Top board (seat base) ---
const topBoard = box(width, depth, boardT).translate(0, 0, totalH - boardT);

// --- Back panel (thin, full height, for rigidity) ---
const backPanel = box(innerW, boardT / 2, totalH - boardT)
  .translate(boardT, depth - boardT / 2, 0);

// --- Optional center divider ---
const parts = [leftPanel, rightPanel, bottom, topBoard, backPanel, ...shelves];

if (divider >= 1) {
  const divH = totalH - boardT; // from bottom to underside of top board
  parts.push(
    box(boardT, depth, divH).translate(width / 2 - boardT / 2, 0, 0)
  );
}

// --- Seat cushion (overhangs front and sides) ---
const cushionW = width + 2 * seatOverhang;
const cushionD = depth + seatOverhang;
const cushion = box(cushionW, cushionD, seatPad)
  .translate(-seatOverhang, 0, totalH);

const frame = union(...parts);

return [
  { name: "Frame", shape: frame, color: "#c4956a" },
  { name: "Cushion", shape: cushion, color: "#5a4a3a" },
];

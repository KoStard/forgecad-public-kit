// Tool Shelf — multi-shelf unit with identical containers
// Demonstrates require() for reusing the same container across shelves

const shelfW = param("Shelf Width", 800, { min: 400, max: 1200, unit: "mm" });
const shelfD = param("Shelf Depth", 200, { min: 150, max: 350, unit: "mm" });
const totalH = param("Total Height", 1200, { min: 600, max: 1800, unit: "mm" });
const boardT = param("Board Thickness", 18, { min: 12, max: 25, unit: "mm" });
const rows = param("Shelf Rows", 4, { min: 2, max: 6, integer: true });
const cols = param("Containers/Row", 3, { min: 1, max: 6, integer: true });

// Container dimensions (must match container.forge.js defaults or be close)
const containerW = 120;
const containerD = 180;
const containerH = 100;
const lipH = 5;

// Derived
const innerW = shelfW - 2 * boardT;
const rowH = (totalH - boardT) / rows; // spacing between shelves

// --- Side panels ---
const leftPanel = box(boardT, shelfD, totalH);
const rightPanel = box(boardT, shelfD, totalH).translate(shelfW - boardT, 0, 0);

// --- Shelf boards (horizontal) ---
const shelfBoards = [];
for (let i = 0; i <= rows; i++) {
  shelfBoards.push(
    box(innerW, shelfD, boardT).translate(boardT, 0, i * rowH)
  );
}

// --- Back panel (thin, full height) ---
const backPanel = box(innerW, boardT / 2, totalH)
  .translate(boardT, shelfD - boardT / 2, 0);

const frame = union(leftPanel, rightPanel, backPanel, ...shelfBoards);

// --- Import and place containers ---
const container = require("shelf/container.forge.js");

const containers = [];
const gapX = (innerW - cols * (containerW + lipH * 2)) / (cols + 1);
const gapY = 5; // small gap from front edge

for (let row = 0; row < rows; row++) {
  const shelfZ = row * rowH + boardT; // top of shelf board
  for (let col = 0; col < cols; col++) {
    const cx = boardT + gapX * (col + 1) + col * (containerW + lipH * 2) + lipH;
    const cy = gapY;
    containers.push(
      container.translate(cx, cy, shelfZ)
    );
  }
}

const allContainers = union(...containers);

return [
  { name: "Frame", shape: frame, color: "#b08050" },
  { name: "Containers", shape: allContainers, color: "#4477aa" },
];

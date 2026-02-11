// Shoe Rack with Doors — 2-level shelves, sitting area, openable cabinet doors
//
// 4 doors (2 per shelf level), hinged at the outer edges.
// Each pair shares one angle slider for synchronized open/close.

const width = param("Width", 800, { min: 500, max: 1200, unit: "mm" });
const depth = param("Depth", 350, { min: 250, max: 500, unit: "mm" });
const totalH = param("Total Height", 500, { min: 350, max: 650, unit: "mm" });

const boardT = param("Board Thickness", 18, { min: 12, max: 25, unit: "mm" });

const seatPad = param("Seat Padding", 30, { min: 15, max: 60, unit: "mm" });
const seatOverhang = param("Seat Overhang", 10, { min: 0, max: 30, unit: "mm" });

const doorT = param("Door Thickness", 8, { min: 4, max: 15, unit: "mm" });
const doorGap = param("Door Gap", 2, { min: 1, max: 5, unit: "mm" });

// Derived
const innerW = width - 2 * boardT;
const shelfCount = 2;
const shelfSpacing = (totalH - boardT) / (shelfCount + 1);
const halfInnerW = innerW / 2;

// ── Frame (same as shoe-rack.forge.js + center divider always on) ──
const leftPanel = box(boardT, depth, totalH);
const rightPanel = box(boardT, depth, totalH).translate(width - boardT, 0, 0);
const bottom = box(innerW, depth, boardT).translate(boardT, 0, 0);
const topBoard = box(width, depth, boardT).translate(0, 0, totalH - boardT);
const backPanel = box(innerW, boardT / 2, totalH - boardT)
  .translate(boardT, depth - boardT / 2, 0);
const divider = box(boardT, depth, totalH - boardT)
  .translate(width / 2 - boardT / 2, 0, 0);

const shelves = [];
for (let i = 1; i <= shelfCount; i++) {
  shelves.push(
    box(innerW, depth, boardT).translate(boardT, 0, i * shelfSpacing)
  );
}

const frame = union(
  leftPanel, rightPanel, bottom, topBoard, backPanel, divider, ...shelves
);

// ── Cushion ──
const cushionW = width + 2 * seatOverhang;
const cushionD = depth + seatOverhang;
const cushion = box(cushionW, cushionD, seatPad)
  .translate(-seatOverhang, 0, totalH);

// ── Doors ──
// Each compartment gets one door. Door width = half inner width minus gaps.
const doorW = halfInnerW - boardT / 2 - doorGap;

// Door positions: [pivotX, hingeSign, shelfIndex]
// hingeSign: -1 = hinged on left edge (opens left), +1 = hinged on right edge (opens right)
const doorDefs = [
  // Bottom-left: hinged at left panel, opens outward (negative Z rotation)
  { pivotX: boardT, sign: -1, level: 0 },
  // Bottom-right: hinged at right panel, opens outward (positive Z rotation)
  { pivotX: width - boardT, sign: 1, level: 0 },
  // Top-left
  { pivotX: boardT, sign: -1, level: 1 },
  // Top-right
  { pivotX: width - boardT, sign: 1, level: 1 },
];

const doorParts = [];

for (const d of doorDefs) {
  const z = d.level * shelfSpacing + boardT + doorGap;
  const doorH = shelfSpacing - boardT - 2 * doorGap;

  // Left-hinged: door extends to the right of pivot
  // Right-hinged: door extends to the left of pivot
  const doorX = d.sign === -1
    ? d.pivotX                    // left hinge: door starts at pivot, goes right
    : d.pivotX - doorW;           // right hinge: door ends at pivot, starts left

  const panel = box(doorW, doorT, doorH)
    .translate(doorX, -doorT, z);

  const label = d.level === 0 ? "Bottom" : "Top";
  const side = d.sign === -1 ? "Left" : "Right";

  // Left doors: rotate negative (outward = clockwise from top = negative Z)
  // Right doors: rotate positive (outward = counter-clockwise from top)
  const minA = d.sign === -1 ? -120 : 0;
  const maxA = d.sign === -1 ? 0 : 120;
  const defA = 0;

  const opened = joint(`${label} ${side} Door`, panel, [d.pivotX, 0, 0], {
    axis: [0, 0, 1],
    min: minA,
    max: maxA,
    default: defA,
    reverse: d.sign === -1,
  });

  doorParts.push({ name: `${label} ${side} Door`, shape: opened, color: "#a07850" });
}

return [
  { name: "Frame", shape: frame, color: "#c4956a" },
  { name: "Cushion", shape: cushion, color: "#5a4a3a" },
  ...doorParts,
];

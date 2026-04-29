// Stress test — 3×2 honeycomb grid with shared edges
// 19 unique points, 24 unique lines, 55 constraints
// Uses point/line caching to properly share vertices and edges between cells.
// Natural redundancy: neighbor cells duplicate angle/equal constraints on shared edges.
// Expected: orange "over-redundant" status, DOF=-12, ~300ms solve time

const sk = constrainedSketch();

const COLS = 3;
const ROWS = 2;
const SIDE = Param.number("cell_size", 8, { unit: "mm" });

// Flat-top hex: vertex 0 at 0° (right), CCW
const vAngles = [0, 60, 120, 180, 240, 300].map(d => d * Math.PI / 180);
// Side angles (flat-top): side 0→1 is 90°, 1→2 is 150°, etc.
const sideAngles = [90, 150, 210, 270, 330, 30];

// Point cache: quantized position → point (to share vertices)
const pointCache = new Map();
function getPoint(x, y) {
  const k = `${Math.round(x * 100)},${Math.round(y * 100)}`;
  if (pointCache.has(k)) return pointCache.get(k);
  const p = sk.point(x, y);
  pointCache.set(k, p);
  return p;
}

// Line cache: point-pair key → line (to share edges between cells)
const lineCache = new Map();
function getLine(p1, p2, k1, k2) {
  const fwd = `${k1}|${k2}`;
  const rev = `${k2}|${k1}`;
  if (lineCache.has(fwd)) return { line: lineCache.get(fwd), isNew: false };
  if (lineCache.has(rev)) return { line: lineCache.get(rev), isNew: false };
  const l = sk.line(p1, p2);
  lineCache.set(fwd, l);
  return { line: l, isNew: true };
}

const allNewLines = [];

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const cx = c * 12;
    const cy = r * 13.86 + (c % 2) * 6.93;

    const pts = [];
    const ptKeys = [];
    for (let v = 0; v < 6; v++) {
      const px = cx + 8 * Math.cos(vAngles[v]);
      const py = cy + 8 * Math.sin(vAngles[v]);
      pts.push(getPoint(px, py));
      ptKeys.push(`${Math.round(px * 100)},${Math.round(py * 100)}`);
    }

    // Only constrain NEW (unique) edges — shared edges already constrained by first cell
    for (let v = 0; v < 6; v++) {
      const v2 = (v + 1) % 6;
      const { line, isNew } = getLine(pts[v], pts[v2], ptKeys[v], ptKeys[v2]);
      if (isNew) {
        allNewLines.push({ line, angle: sideAngles[v] });
      }
    }
  }
}

// Anchor origin
sk.fix(Array.from(pointCache.values())[0]);

// All unique lines: set angle + equal length
for (let i = 0; i < allNewLines.length; i++) {
  const { line, angle } = allNewLines[i];
  sk.absoluteAngle(line, angle);
  if (i > 0) sk.equal(allNewLines[0].line, line);
}
sk.length(allNewLines[0].line, SIDE);

return sk.solve({ iterations: 200, restarts: 8 });

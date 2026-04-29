// Stress test — 50-segment square spiral
// 51 points, 50 lines, 101 constraints (equal, perpendicular, length, fix, absoluteAngle)
// Tests solver performance on long constraint chains with error accumulation.
// Expected: green "fully" status, DOF=0, ~1-2s solve time

const sk = constrainedSketch();

const N = 50; // number of segments
const SEG_LEN = Param.number("seg_len", 5, { unit: "mm" });

// Build a spiral: each segment turns 90° left from the previous,
// with increasing runs (1,1,2,2,3,3,4,4,...) to form a square spiral.
const points = [sk.point(0, 0)];
const lines = [];

// Pre-compute spiral positions for initial guesses
let x = 0, y = 0;
let dx = 1, dy = 0;
let stepsInRun = 1;
let stepCount = 0;
let turnCount = 0;

for (let i = 0; i < N; i++) {
  x += dx * 5;
  y += dy * 5;
  points.push(sk.point(x, y));
  lines.push(sk.line(points[i], points[i + 1]));

  stepCount++;
  if (stepCount >= stepsInRun) {
    stepCount = 0;
    // Turn left: (dx,dy) -> (-dy,dx)
    const tmp = dx;
    dx = -dy;
    dy = tmp;
    turnCount++;
    if (turnCount % 2 === 0) stepsInRun++;
  }
}

// Anchor: fix origin point and first segment angle
sk.fix(points[0]);
sk.absoluteAngle(lines[0], 0);

// All segments equal length
for (let i = 1; i < lines.length; i++) {
  sk.equal(lines[0], lines[i]);
}
sk.length(lines[0], SEG_LEN);

// Each consecutive pair is perpendicular (spiral turns)
for (let i = 0; i < lines.length - 1; i++) {
  sk.perpendicular(lines[i], lines[i + 1]);
}

return sk.solve({ iterations: 200, restarts: 8 });

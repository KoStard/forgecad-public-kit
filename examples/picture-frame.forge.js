// Picture Frame — parametric wall frame with optional mat border

const frameW = param("Frame Width", 120, { min: 60, max: 250, unit: "mm" });
const frameH = param("Frame Height", 160, { min: 80, max: 300, unit: "mm" });
const border = param("Border Width", 12, { min: 5, max: 30, unit: "mm" });
const depth = param("Frame Depth", 8, { min: 3, max: 20, unit: "mm" });
const mat = param("Mat Width", 8, { min: 0, max: 20, unit: "mm" });
const matDepth = param("Mat Depth", 2, { min: 1, max: 5, unit: "mm" });

// Outer frame
const outer = box(frameW, frameH, depth);
const opening = box(frameW - 2 * border, frameH - 2 * border, depth + 2)
  .translate(border, border, -1);
const frame = outer.subtract(opening);

// Mat insert (thinner, slightly smaller opening)
const parts = [{ name: "Frame", shape: frame, color: "#5c3a1e" }];

if (mat > 0) {
  const matOuter = box(frameW - 2 * border, frameH - 2 * border, matDepth)
    .translate(border, border, 0);
  const matHole = box(
    frameW - 2 * border - 2 * mat,
    frameH - 2 * border - 2 * mat,
    matDepth + 2
  ).translate(border + mat, border + mat, -1);
  parts.push({ name: "Mat", shape: matOuter.subtract(matHole), color: "#f5f0e8" });
}

// Back panel
const back = box(frameW - 2, frameH - 2, 1).translate(1, 1, -1);
parts.push({ name: "Back", shape: back, color: "#3a3a3a" });

return parts;

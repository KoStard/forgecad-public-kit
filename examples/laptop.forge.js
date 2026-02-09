// Laptop — Entity-based API demo
// Uses Rectangle2D with named sides, TrackedShape with rotateAroundEdge

const bottomW = param("Width", 300, { min: 200, max: 400, unit: "mm" });
const bottomD = param("Depth", 200, { min: 150, max: 300, unit: "mm" });
const bottomH = param("Base Height", 15, { min: 8, max: 25, unit: "mm" });
const topH = param("Screen Height", 5, { min: 3, max: 10, unit: "mm" });
const screenTall = param("Screen Tall", 200, { min: 150, max: 280, unit: "mm" });
const openAngle = param("Open Angle", 110, { min: 90, max: 170, unit: "°" });

// Base — rectangle entity knows its sides and vertices
const baseRect = Rectangle2D.fromCenterAndDimensions(point(0, 0), bottomW, bottomD);
const base = baseRect.extrude(bottomH);

// Screen — same width as base, thinner
const screenRect = Rectangle2D.fromCenterAndDimensions(point(0, 0), bottomW, screenTall);
const screenPanel = screenRect.extrude(topH);

// Position screen on top of base at the back edge, then rotate open
const screen = screenPanel
  .moveBy(0, bottomD / 2, bottomH)
  .rotateAroundEdge('top-top', -(180 - openAngle));

return union(base.toShape(), screen.toShape());

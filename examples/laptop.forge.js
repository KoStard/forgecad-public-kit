// Laptop — Entity-based API demo
// Rectangle2D with named sides, TrackedShape with rotateAroundEdge

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
const screen = screenRect.extrude(topH)
  .moveBy(0, 0, bottomH)
  .rotateAroundEdge('top-top', -openAngle);

// union() accepts TrackedShape directly
return union(base, screen);

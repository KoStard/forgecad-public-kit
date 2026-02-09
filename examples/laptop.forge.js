// Laptop — Entity-based API demo
// Uses Rectangle2D with named sides, extrude with topology tracking

const bottomW = param("Width", 300, { min: 200, max: 400, unit: "mm" });
const bottomD = param("Depth", 200, { min: 150, max: 300, unit: "mm" });
const bottomH = param("Base Height", 15, { min: 8, max: 25, unit: "mm" });
const topH = param("Screen Height", 5, { min: 3, max: 10, unit: "mm" });
const screenH = param("Screen Tall", 200, { min: 150, max: 280, unit: "mm" });
const openAngle = param("Open Angle", 110, { min: 90, max: 170, unit: "°" });

// Base — rectangle entity knows its sides
const baseRect = Rectangle2D.fromCenterAndDimensions(point(0, 0), bottomW, bottomD);
const base = baseRect.extrude(bottomH);

// Screen — same width, thinner
const screenRect = Rectangle2D.fromCenterAndDimensions(point(0, 0), bottomW, screenH);
const screenPanel = screenRect.toSketch().extrude(topH);

// Position screen: sits on top of base, hinged at back edge
// The back edge of the base is the "top" side of the rectangle (positive Y)
const hingeEdge = base.edge('top-top'); // top face, top-side edge

// Rotate screen around hinge
const screen = screenPanel
  .translate(0, bottomD / 2, bottomH)  // move to hinge position
  .rotate(-(180 - openAngle), 0, 0);   // open the lid

return union(base.toShape(), screen);

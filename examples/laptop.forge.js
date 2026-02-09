// Laptop — Entity-based API demo
// Rectangle2D with named sides, TrackedShape with rotateAroundEdge, arcBridge

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
  .moveBy(0, bottomD / 2, bottomH)
  .rotateAroundEdge('bottom-top', -(180 - openAngle));

// Hinge arc — connects the back-top edge of base to the back-bottom edge of screen
// Base hinge edge: top-top (back edge of top face)
const hingeBase = base.edge('top-top');

// Screen hinge edge: after rotation topology is cleared, but we know where it is
// It's at the same position as hingeBase but offset by topH in the screen's rotated direction
const rad = -(180 - openAngle) * Math.PI / 180;
const hingeScreen = {
  name: 'screen-hinge',
  start: [hingeBase.start[0], hingeBase.start[1] + Math.cos(rad) * topH, hingeBase.start[2] + Math.sin(rad) * topH],
  end: [hingeBase.end[0], hingeBase.end[1] + Math.cos(rad) * topH, hingeBase.end[2] + Math.sin(rad) * topH],
};

const hinge = arcBridgeBetweenEdges(hingeBase, hingeScreen, 16);

return union(base, screen, hinge);

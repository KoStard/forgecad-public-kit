// Flat-Screen TV with Stand — Entity-based API demo
// Rectangle2D for named geometry, TrackedShape for topology

const tvWidth = param("TV Width", 1200, { min: 800, max: 1600, unit: "mm" });
const tvHeight = param("TV Height", 700, { min: 500, max: 1000, unit: "mm" });
const tvThick = param("TV Thickness", 40, { min: 20, max: 80, unit: "mm" });

const standW = param("Stand Width", 400, { min: 200, max: 600, unit: "mm" });
const standD = param("Stand Depth", 250, { min: 150, max: 400, unit: "mm" });
const standH = param("Stand Height", 60, { min: 30, max: 120, unit: "mm" });

// TV panel: wide in X, thin in Y, tall in Z
const panelRect = Rectangle2D.fromCenterAndDimensions(point(0, 0), tvWidth, tvThick);
const panel = panelRect.extrude(tvHeight).moveBy(0, 0, standH);

// Stand: wider in Y (depth), centered
const standRect = Rectangle2D.fromCenterAndDimensions(point(0, 0), standW, standD);
const stand = standRect.extrude(standH);

// union() auto-unwraps TrackedShape
return union(stand, panel);

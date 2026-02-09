////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// 2D sketch


// Take the ideas, not the names, they need polishing
const line1 = Line.fromCoordinates(x1,y1,x2,y2);
const line2 = Line.fromCoordinateAndAngle(x1,y1,angle,length);
const line3 = Line.parallelTo(line1, distance, directionBoolean); // true -> positive either "towards" x or y positive


Point(x, y)
Rectangle.from2Coordinates(p1,p2); // keeps the sides on x and y
const rectangle = Rectangle.from3Coordinates(p1,p2,p3); // free to put at any angle

// Open problem
rectangle.chooseSide(2) // How to implement something like this, while keeping it consistent across re-renders?
// Maybe use the p1 as a starting point?

Constraint.makeParallel(rectangle.chooseSide(2), line2)
Constraint.enforceAngle(line1, line2, angle);

// Should there be a central place from where the addConstraint method is called, or it should be a global function?

// The constraints system should figure out that some things are impossible and reject. Also sometimes it will be way too complex maybe, reject these as well, but should be close to as good as with Fusion 360.


////////////////////////////////////////////////////////////
// 3D

const sketch = importSketch(...);
const area = sketch.chooseArea(1); // Again, how will we ~guarantee consistency here between rerenders, modifications, etc? Maybe the identity should be built based on the objects around them, then indices given to them. If a new area is added, it gets incremental number. So the sequence/indices need to be saved I guess. Maybe this also means that we should show the indices in the 2D view.

const object = area.extrude(height, isUpBoolean); // Here the up should be more "objective", in the sense that when we import a surface, it comes to XY at first, and the Z is up. Then if we rotate, the normal rotates as well and it stays the up.

object.rotateAround(line, angle); // direction of angle matters here
const object2 = object.duplicate();

// We should be able to get the dimensions of an object in live
object2.boundingBox()


// It should be possible to easily refer to a vertex or edge
// Maybe it will work only in case of extrusion or similar things, as if we just have a mesh, it's hard to refer to specific ones
// But for extrusion, if each vertex of the area had a label, we can just name it `{vertexLabel}-extrusion`, and somehow allow getting it, like object.getVertex("name"), etc

////////////////////////////////////////////////////////////
/// Algorithms

We need to have a catalog of algorithms that can be applied to the given problem.
ArcFiller.betweenTwoAreas is an example of it, but what are the other algorithms? We should prepare for what's to come, have the right interfaces that will allow flexibility, etc.

////////////////////////////////////////////////////////////
/// Examples

/// Laptop
const bottomWidth = param(...);
const bottomLength = param(...);
const bottomHeight = param(...);
const topHeight = param(...);
const bottom = rectangle(0, 0, bottomWidth, bottomLength).extrude(bottomHeight);
const top = rectangle(0, 0, bottomWidth, bottomLength).extrude(topHeight);
top.moveBy(0, 0, bottomHeight);
top.rotateAround(top.getEdge("width1"), degrees(120));

const joint = ArcFiller.betweenTwoAreas(top.getSurface("width1_extrusion"), bottom.getSurface("width1_extrusion"));
// In Fusion360 there is a feature when you choose 2 surfaces, it creates a "filler", which starts from one and goes to the other one with nice transition arc

return union(bottom, top, joint);

/// Simple Parametric Flat-Screen TV with Central Stand
/// Axes: X = left/right, Y = front/back (depth), Z = up/down
/// The panel is thin in Y (depth), wide in X, tall in Z.
/// The stand is centered, wider in depth for stability, and overlaps slightly into the panel for clean union.

const tvWidth = param("TV Width", 1200);
const tvHeight = param("TV Height", 800);
const tvThickness = param("TV Thickness", 40);

const standWidth = param("Stand Width", 450);
const standDepth = param("Stand Depth", 280);
const standHeight = param("Stand Height", 80);
const standOverlap = param("Stand Overlap", 15); // small overlap for solid union without gaps

// TV panel: thin rectangle in X-Y (wide X, thin Y), extruded tall in Z
const panelSketch = Rectangle.fromCenterAndDimensions(
  Point(0, 0),
  tvWidth,
  tvThickness
);
const panel = panelSketch.extrude(tvHeight);
panel.moveBy(0, 0, standHeight); // raise panel so its bottom sits on top of stand

// Optional: shift panel slightly backward if you want a slight "leaning" look
// panel.rotateAround(panel.getEdge("bottom"), degrees(-5));

// Stand: wider in depth (Y), narrower in width (X), extruded shorter but with overlap
const standSketch = Rectangle.fromCenterAndDimensions(
  Point(0, 0),
  standWidth,
  standDepth
);
const stand = standSketch.extrude(standHeight + standOverlap);

// Optional: shift stand backward so it extends mostly to the rear (modern TV look)
stand.moveBy(0, -tvThickness / 4, 0); // adjust to taste; negative Y = toward back

// Optional nicer connection: rounded fillet between panel bottom and stand
// (using the ArcFiller idea from the laptop example)
const panelBottomSurface = panel.getSurface("bottom"); // the downward-facing face after raising
const standTopSurface = stand.getSurface("top");
const fillet = ArcFiller.betweenTwoAreas(panelBottomSurface, standTopSurface);

// Final model
return union(panel, stand, fillet); // omit fillet if not needed
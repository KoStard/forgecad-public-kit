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
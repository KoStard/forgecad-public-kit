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

addConstraint(Constraint.makeParallel(rectangle.chooseSide(2), line2))
// Should there be a central place from where the addConstraint method is called, or it should be a global function?


////////////////////////////////////////////////////////////

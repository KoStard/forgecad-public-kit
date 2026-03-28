const bottomPlate = box(40, 30, 5).translate(0, 0, 3.75);

const sidePlate = box(5, 30, 40).translate(17.5, 0, 25);

const holeBottom = cylinder(5, 3.25, 16).rotate(90, 0, 0).translate(0, 0, 3.75);

const holeSide = cylinder(5, 3.25, 16).translate(17.5, 0, 25);

const bracket = bottomPlate.subtract(holeBottom).union(sidePlate.subtract(holeSide));

return bracket;
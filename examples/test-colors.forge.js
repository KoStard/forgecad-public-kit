// Test color support

const redBox = box(20, 20, 20).color("#ff0000").translate(-25, 0, 0);
const blueSphere = sphere(12).color("#0000ff").translate(25, 0, 0);

// Union should preserve first operand color (red)
const combined = redBox.add(blueSphere).translate(0, 30, 0);

// Sketch colors
const greenRect = rect(30, 10).color("#00ff00").translate(0, -30);
const yellowCircle = circle2d(10).color("#ffff00").translate(0, -30);

return [
    { name: "Red Box", shape: redBox },
    { name: "Blue Sphere", shape: blueSphere },
    { name: "Combined (Red)", shape: combined },
    { name: "Green Rect", sketch: greenRect },
    { name: "Yellow Circle", sketch: yellowCircle }
];

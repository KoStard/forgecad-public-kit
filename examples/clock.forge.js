// Parametric Wall Clock — Apple Style
// Clean, minimalist analog clock with full color customization
// Returns named objects to preserve colors and enable individual visibility control

// === Dimensions ===
const diameter = param("Diameter", 220, { min: 80, max: 400, unit: "mm" });
const depth = param("Depth", 18, { min: 8, max: 50, unit: "mm" });
const rimWidth = param("Rim Width", 8, { min: 3, max: 30, unit: "mm" });

// === Time Settings — Default 10:10:30 (Apple display time) ===
const hour = param("Hour", 10, { min: 1, max: 12, integer: true });
const minute = param("Minute", 10, { min: 0, max: 59, integer: true });
const second = param("Second", 30, { min: 0, max: 59, integer: true });
const showSecondHand = param("Show Seconds", 1, { min: 0, max: 1, integer: true });

// === Color Customization ===
const rimColor = param("Rim Color", 0, { min: 0, max: 3, integer: true }); // 0=silver, 1=gold, 2=black, 3=rose
const faceColor = param("Face Color", 0, { min: 0, max: 2, integer: true }); // 0=white, 1=black, 2=cream
const markerColor = param("Marker Color", 0, { min: 0, max: 2, integer: true }); // 0=black, 1=white, 2=gold
const hourHandColor = param("Hour Hand Color", 0, { min: 0, max: 3, integer: true }); // 0=black, 1=white, 2=gold, 3=red
const minuteHandColor = param("Minute Hand Color", 1, { min: 0, max: 3, integer: true }); // 0=black, 1=white, 2=gold, 3=red
const secondHandColor = param("Second Hand Color", 3, { min: 0, max: 3, integer: true }); // 0=black, 1=white, 2=gold, 3=red

// Color palette
const colors = {
  silver: "#C0C0C0",
  gold: "#D4AF37",
  black: "#1A1A1A",
  rose: "#B76E79",
  white: "#FFFFFF",
  cream: "#F5F5DC",
  red: "#FF3B30",
  darkGray: "#2F2F2F"
};

// Resolve colors
const rimHex = [colors.silver, colors.gold, colors.black, colors.rose][rimColor];
const faceHex = [colors.white, colors.black, colors.cream][faceColor];
const markerHex = [colors.black, colors.white, colors.gold][markerColor];
const hourHandHex = [colors.black, colors.white, colors.gold, colors.red][hourHandColor];
const minuteHandHex = [colors.black, colors.white, colors.gold, colors.red][minuteHandColor];
const secondHandHex = [colors.black, colors.white, colors.gold, colors.red][secondHandColor];

// === Calculated values ===
const radius = diameter / 2;
const innerRadius = radius - rimWidth;
const handBaseZ = depth / 2 - 2;

// === Clock Rim ===
const outer = cylinder(depth, radius, undefined, undefined, true);
const inner = cylinder(depth + 2, innerRadius, undefined, undefined, true);
const rimBody = outer.subtract(inner);

// Add subtle bevel to rim edge
const bevel = cylinder(depth - 5, radius - 1, radius, undefined, true);
const rim = union(rimBody, bevel).color(rimHex);

// === Clock Face ===
const face = cylinder(2, innerRadius - 1, undefined, undefined, true)
  .translate(0, 0, depth / 2 - 3)
  .color(faceHex);

// === Hour Markers ===
const markerLength = param("Marker Length", 10, { min: 5, max: 25, unit: "mm" });
const markerWidth = param("Marker Width", 2.5, { min: 1, max: 6, unit: "mm" });

const markerShapes = [];
for (let i = 0; i < 12; i++) {
  const angle = i * 30;
  const isCardinal = i % 3 === 0;
  const length = isCardinal ? markerLength * 1.5 : markerLength;
  const width = isCardinal ? markerWidth * 1.4 : markerWidth;
  
  const r = innerRadius - length / 2 - 6;
  const rad = (angle - 90) * Math.PI / 180;
  const x = Math.cos(rad) * r;
  const y = Math.sin(rad) * r;
  
  const tick = roundedRect(width, length, width / 2, true)
    .rotate(angle)
    .extrude(1)
    .translate(x, y, depth / 2 - 2);
  
  markerShapes.push(tick);
}
const markers = union(...markerShapes).color(markerHex);

// === Clock Hands ===
const hourHandLength = param("Hour Hand Length", 55, { min: 25, max: 110, unit: "mm" });
const hourHandWidth = param("Hour Hand Width", 10, { min: 5, max: 20, unit: "mm" });
const minuteHandLength = param("Minute Hand Length", 80, { min: 40, max: 160, unit: "mm" });
const minuteHandWidth = param("Minute Hand Width", 7, { min: 3, max: 14, unit: "mm" });
const secondHandLength = param("Second Hand Length", 85, { min: 50, max: 170, unit: "mm" });
const secondHandWidth = param("Second Hand Width", 2, { min: 1, max: 5, unit: "mm" });

// Calculate hand angles (0 degrees = 12 o'clock, clockwise)
const hourAngle = (hour % 12) * 30 + (minute / 60) * 30;
const minuteAngle = minute * 6 + (second / 60) * 6;
const secondAngle = second * 6;

// Create Apple-style hand with rounded ends
function createHand(length, width, angle, zOffset, thickness) {
  return roundedRect(width, length, width / 2, true)
    .translate(0, length / 2)
    .extrude(thickness)
    .rotate(0, 0, angle - 90)
    .translate(0, 0, zOffset);
}

// Hour hand
const hourHand = createHand(hourHandLength, hourHandWidth, hourAngle, handBaseZ + 2, 4)
  .color(hourHandHex);

// Minute hand
const minuteHand = createHand(minuteHandLength, minuteHandWidth, minuteAngle, handBaseZ + 6, 3)
  .color(minuteHandHex);

// Second hand with counter-balance
let secondHand = null;
if (showSecondHand > 0) {
  const counterLength = 25;
  const counterWidth = 4;
  
  const sweep = createHand(secondHandLength, secondHandWidth, secondAngle, handBaseZ + 10, 2);
  const counter = roundedRect(counterWidth, counterLength, counterWidth / 2, true)
    .translate(0, -counterLength / 2)
    .extrude(2)
    .rotate(0, 0, secondAngle - 90)
    .translate(0, 0, handBaseZ + 10);
  
  secondHand = union(sweep, counter).color(secondHandHex);
}

// === Center Cap ===
const centerRadius = 6;
const centerRing = cylinder(3, centerRadius + 2, undefined, undefined, true)
  .translate(0, 0, handBaseZ + 13)
  .color(rimHex);

const centerDot = cylinder(4, centerRadius, undefined, undefined, true)
  .translate(0, 0, handBaseZ + 13)
  .color(showSecondHand > 0 ? secondHandHex : "#444444");

// === Wall Mount ===
const mountWidth = 25;
const mountHeight = 12;
const mountDepth = 6;
const mount = roundedRect(mountWidth, mountHeight, 3, true)
  .extrude(mountDepth)
  .translate(0, -radius + 8, -depth / 2 - mountDepth / 2)
  .color(rimHex);

// === Return Named Objects (colors preserved!) ===
const objects = [
  { name: "Rim", shape: rim },
  { name: "Face", shape: face },
  { name: "Markers", shape: markers },
  { name: "Hour Hand", shape: hourHand },
  { name: "Minute Hand", shape: minuteHand },
  { name: "Center Ring", shape: centerRing },
  { name: "Center Dot", shape: centerDot },
  { name: "Wall Mount", shape: mount }
];

if (secondHand) {
  objects.push({ name: "Second Hand", shape: secondHand });
}

return objects;

// Spider-Man Birthday Cake
// A multi-tiered cake with Spider-Man colors and decorations.

const tierHeight = param("Tier Height", 30, { min: 20, max: 50, unit: "mm" });
const baseRadius = param("Base Radius", 60, { min: 40, max: 100, unit: "mm" });

// Colors
const spideyRed = '#e60000';
const spideyBlue = '#0055aa';
const spideyBlack = '#111111';
const spideyWhite = '#ffffff';
const candleYellow = '#ffff44';
const flameOrange = '#ff8800';

const cake = [];

// --- Bottom Tier (Blue) ---
const bottomTier = cylinder(tierHeight, baseRadius).color(spideyBlue);
cake.push({ name: "Bottom Tier", shape: bottomTier });

// --- Middle Tier (Red with Webbing) ---
const midRadius = baseRadius * 0.75;
const midTier = cylinder(tierHeight, midRadius).color(spideyRed)
  .attachTo(bottomTier, 'top', 'bottom');

// Vertical webbing lines for middle tier
const webLine = cylinder(tierHeight, 0.6).color(spideyBlack);
const midWebs = circularPattern(webLine.translate(midRadius - 0.2, 0, 0), 12)
  .attachTo(bottomTier, 'top', 'bottom');

cake.push({ name: "Middle Tier", shape: midTier });
cake.push({ name: "Middle Webbing", shape: midWebs });

// --- Top Tier (Red with Eyes) ---
const topRadius = midRadius * 0.7;
const topTier = cylinder(tierHeight, topRadius).color(spideyRed)
  .attachTo(midTier, 'top', 'bottom');

// Vertical webbing lines for top tier
const topWebs = circularPattern(webLine.translate(topRadius - 0.2, 0, 0), 12)
  .attachTo(midTier, 'top', 'bottom');

// Spider-Man Eyes (simplified as angled boxes on the front)
const eyeW = topRadius * 0.4;
const eyeH = tierHeight * 0.6;
const eyeT = 2;

const leftEye = box(eyeW, eyeT, eyeH, true).color(spideyWhite)
  .rotate(0, 0, 20)
  .onFace(topTier, 'front', { u: -topRadius * 0.35, v: 0, protrude: 1 });

const rightEye = box(eyeW, eyeT, eyeH, true).color(spideyWhite)
  .rotate(0, 0, -20)
  .onFace(topTier, 'front', { u: topRadius * 0.35, v: 0, protrude: 1 });

cake.push({ name: "Top Tier", shape: topTier });
cake.push({ name: "Top Webbing", shape: topWebs });
cake.push({ name: "Left Eye", shape: leftEye });
cake.push({ name: "Right Eye", shape: rightEye });

// --- Candles on Top ---
const candleR = 2;
const candleH = 15;
const candleCount = 6;

for (let i = 0; i < candleCount; i++) {
  const angle = (i / candleCount) * 360;
  const rad = topRadius * 0.6;
  const x = rad * Math.cos(angle * Math.PI / 180);
  const y = rad * Math.sin(angle * Math.PI / 180);

  const candleBody = cylinder(candleH, candleR).color(candleYellow)
    .attachTo(topTier, 'top', 'bottom', [x, y, 0]);

  const flame = sphere(2.5).color(flameOrange)
    .attachTo(candleBody, 'top', 'bottom', [0, 0, 1]);

  cake.push({ name: `Candle ${i + 1}`, shape: group(candleBody, flame) });
}

// --- Cake Board ---
const board = cylinder(3, baseRadius + 10).color('#eeeeee')
  .attachTo(bottomTier, 'bottom', 'top');
cake.push({ name: "Cake Board", shape: board });

return cake;

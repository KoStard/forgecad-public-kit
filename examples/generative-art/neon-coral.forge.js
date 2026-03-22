/**
 * Neon Coral — Generative Art Demo
 *
 * Glowing vertical stalks with bulbous tips arranged in a coral-like cluster.
 * Each stalk is a real CAD solid — exportable for 3D printing.
 *
 * This is the showpiece: dramatic scene(), parametric growth,
 * and the kind of render you'd hang on a wall.
 */

// ---------------------------------------------------------------------------
// Scene — Deep ocean / neon aesthetic
// ---------------------------------------------------------------------------
scene({
  background: { top: '#000814', bottom: '#001d3d' },

  camera: {
    position: [160, -120, 100],
    target: [0, 0, 50],
    fov: 52,
  },

  lights: [
    { type: 'ambient', color: '#001233', intensity: 0.08 },
    { type: 'point', position: [120, -80, 130], color: '#00f5d4', intensity: 4, distance: 400, decay: 1 },
    { type: 'point', position: [-100, 60, 20], color: '#f72585', intensity: 3, distance: 350, decay: 1.2 },
    { type: 'point', position: [-30, 150, 80], color: '#7209b7', intensity: 2, distance: 300, decay: 1.5 },
    { type: 'directional', position: [50, -30, 200], color: '#ffd60a', intensity: 1.2 },
    { type: 'hemisphere', skyColor: '#003566', groundColor: '#000814', intensity: 0.2 },
  ],

  fog: { color: '#000814', near: 100, far: 450 },

  postProcessing: {
    bloom: { intensity: param('bloom', 1.5, 0, 4), threshold: 0.5, radius: 0.7 },
    vignette: { darkness: 0.8, offset: 0.25 },
    grain: { intensity: 0.08 },
    toneMappingExposure: param('exposure', 1.5, 0.5, 4),
  },
});

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const seed = param('seed', 7, 0, 100);
const stalkCount = param('stalks', 25, 5, 60);
const maxStalkH = param('maxHeight', 80, 30, 150);
const clusterSpread = param('spread', 60, 20, 120);
const tipScale = param('tipSize', 1.5, 0.5, 3);

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed * 2741);
const rand = (min, max) => min + rng() * (max - min);

// ---------------------------------------------------------------------------
// Build the coral colony
// ---------------------------------------------------------------------------
const shapes = [];

for (let i = 0; i < stalkCount; i++) {
  const angle = rand(0, Math.PI * 2);
  const dist = rand(0, clusterSpread) * Math.sqrt(rand(0.1, 1));
  const px = Math.cos(angle) * dist;
  const py = Math.sin(angle) * dist;

  // Taller in center, shorter at edges
  const centralness = 1 - dist / clusterSpread;
  const h = maxStalkH * (0.3 + 0.7 * centralness) * rand(0.6, 1.0);
  const r = rand(1.5, 4) * (0.5 + 0.5 * centralness);

  // Stalk
  shapes.push(cylinder(h, r).translate(px, py, 0));

  // Bulbous tip
  shapes.push(sphere(r * tipScale * rand(1.0, 1.8)).translate(px, py, h));

  // Some stalks get secondary buds
  if (rand(0, 1) > 0.5 && h > maxStalkH * 0.4) {
    const budH = h * rand(0.3, 0.5);
    const budR = r * 0.6;
    const budAngleDeg = rand(0, 360);
    const budAngleRad = budAngleDeg * Math.PI / 180;

    shapes.push(
      cylinder(budH, budR)
        .rotate(rand(15, 35), 0, budAngleDeg)
        .translate(px, py, h * 0.3)
    );

    shapes.push(
      sphere(budR * tipScale)
        .translate(
          px + Math.cos(budAngleRad) * r * 3,
          py + Math.sin(budAngleRad) * r * 3,
          h * 0.3 + budH * 0.7
        )
    );
  }
}

// Base mound
shapes.push(
  sphere(clusterSpread * 0.4)
    .scale([1, 1, 0.15])
    .translate(0, 0, -2)
);

// Smaller mounds for organic feel
for (let i = 0; i < 5; i++) {
  const a = rand(0, Math.PI * 2);
  const d = rand(clusterSpread * 0.2, clusterSpread * 0.6);
  shapes.push(
    sphere(rand(8, 15))
      .scale([1, 1, 0.2])
      .translate(Math.cos(a) * d, Math.sin(a) * d, -1)
  );
}

return shapes;

/**
 * Crystal Growth — Generative Art Demo
 *
 * A cluster of crystalline towers growing from a dark base,
 * lit by warm and cool point lights, with fog and bloom
 * creating an ethereal atmosphere.
 *
 * Demonstrates the full scene() API:
 * - Custom camera composition
 * - Dramatic multi-light setup
 * - Dark background with fog
 * - Post-processing (bloom + vignette)
 */

// ---------------------------------------------------------------------------
// Scene Setup — the artistic environment
// ---------------------------------------------------------------------------
scene({
  background: { top: '#0a0612', bottom: '#1a0a2e' },

  camera: {
    position: [280, -180, 160],
    target: [0, 0, 60],
    fov: 50,
  },

  lights: [
    { type: 'ambient', color: '#0d0820', intensity: 0.15 },
    { type: 'point', position: [200, -100, 40], color: '#ff6b35', intensity: 2.5, distance: 600, decay: 1.5 },
    { type: 'point', position: [-150, 80, 250], color: '#4ecdc4', intensity: 2, distance: 500, decay: 1.5 },
    { type: 'point', position: [-80, -200, 100], color: '#c44dff', intensity: 2, distance: 400, decay: 1.5 },
    { type: 'point', position: [0, 0, -20], color: '#ff3366', intensity: 1.5, distance: 300, decay: 1.5 },
    { type: 'hemisphere', skyColor: '#1a0a3e', groundColor: '#0a0612', intensity: 0.3 },
  ],

  fog: { color: '#0a0612', near: 350, far: 900 },

  postProcessing: {
    bloom: { intensity: param('bloom', 1.2, 0, 3), threshold: 0.6, radius: 0.5 },
    vignette: { darkness: 0.7, offset: 0.3 },
    toneMappingExposure: param('exposure', 1.3, 0.5, 3),
  },

  capture: {
    framesPerTurn: 90,
    pitchDeg: 18,
  },
});

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const seed = param('seed', 42, 0, 100);
const crystalCount = param('crystals', 12, 3, 24);
const maxHeight = param('maxHeight', 120, 40, 200);
const baseRadius = param('baseRadius', 80, 30, 150);
const taperFactor = param('taper', 0.3, 0.1, 0.8);

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
const rng = mulberry32(seed * 1337);
const rand = (min, max) => min + rng() * (max - min);

// ---------------------------------------------------------------------------
// Crystal Generator
// ---------------------------------------------------------------------------
function crystal(h, baseW) {
  const r = baseW / 2;

  // Hexagonal prism body
  const bodyH = h * (1 - taperFactor);
  const body = ngon(6, r).extrude(bodyH);

  // Pointed hexagonal pyramid tip
  const tipH = h * taperFactor;
  const tip = ngon(6, r).extrude(tipH, { scaleTop: 0.05 })
    .translate(0, 0, bodyH);

  return union(body, tip);
}

// ---------------------------------------------------------------------------
// Build the crystal cluster
// ---------------------------------------------------------------------------
const crystals = [];

// Crystal palette — gemstone colors
const crystalColors = ['#8b5cf6', '#a855f7', '#6d28d9', '#7c3aed', '#c084fc', '#5b21b6', '#4c1d95', '#9333ea'];
function pickColor() { return crystalColors[Math.floor(rand(0, crystalColors.length - 0.01))]; }

// Central dominant crystal
const mainH = maxHeight * rand(0.85, 1.0);
const mainW = rand(14, 20);
crystals.push({
  name: 'Main Crystal',
  shape: crystal(mainH, mainW)
    .rotate(0, 0, rand(0, 360))
    .translate(rand(-5, 5), rand(-5, 5), 0),
  color: '#a855f7',
});

// Surrounding crystals
for (let i = 0; i < crystalCount - 1; i++) {
  const angle = (i / (crystalCount - 1)) * Math.PI * 2 + rand(-0.3, 0.3);
  const dist = rand(baseRadius * 0.15, baseRadius * 0.7);
  const h = maxHeight * rand(0.2, 0.75);
  const w = rand(6, 16);

  crystals.push({
    name: `Crystal ${i + 2}`,
    shape: crystal(h, w)
      .rotate(rand(-8, 8), rand(-12, 12), rand(0, 360))
      .translate(Math.cos(angle) * dist, Math.sin(angle) * dist, 0),
    color: pickColor(),
  });
}

// Base rock
const baseRock = sphere(baseRadius * 0.5)
  .scale([1, 1, 0.3])
  .translate(0, 0, -baseRadius * 0.05);

return [{ name: 'Base Rock', shape: baseRock, color: '#1a1a2e' }, ...crystals];

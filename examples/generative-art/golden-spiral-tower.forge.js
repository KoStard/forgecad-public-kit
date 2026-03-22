/**
 * Golden Spiral Tower — Generative Art Demo
 *
 * A spiraling tower of boxes arranged in a golden-ratio pattern,
 * like a computational sunflower reaching for the sky.
 *
 * Demonstrates: scene(), param() integration, dramatic lighting,
 * bloom post-processing, and fog depth.
 */

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
scene({
  background: '#050510',

  camera: {
    position: [250, -200, 220],
    target: [0, 0, 100],
    fov: 55,
  },

  lights: [
    { type: 'ambient', color: '#0a0a1a', intensity: 0.1 },
    { type: 'directional', position: [200, -150, 300], color: '#ffb347', intensity: 2.5 },
    { type: 'point', position: [-200, 100, 50], color: '#00d4ff', intensity: 3, distance: 500, decay: 1.2 },
    { type: 'point', position: [0, 0, -30], color: '#ff0066', intensity: 1.5, distance: 300, decay: 2 },
    { type: 'directional', position: [0, 0, 400], color: '#e8e0ff', intensity: 0.8 },
  ],

  fog: { color: '#050510', near: 150, far: 600 },

  postProcessing: {
    bloom: { intensity: param('bloom', 0.8, 0, 3), threshold: 0.7, radius: 0.6 },
    vignette: { darkness: 0.6, offset: 0.4 },
    toneMappingExposure: param('exposure', 1.4, 0.5, 3),
  },
});

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const count = param('elements', 120, 20, 300);
const towerHeight = param('height', 200, 50, 400);
const spiralTightness = param('tightness', 2.5, 0.5, 6);
const maxRadius = param('radius', 60, 20, 120);
const elementScale = param('scale', 1.0, 0.3, 2.0);

// ---------------------------------------------------------------------------
// Golden Ratio Spiral
// ---------------------------------------------------------------------------
const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI / (PHI * PHI);

const shapes = [];

for (let i = 0; i < count; i++) {
  const t = i / count;
  const angle = i * GOLDEN_ANGLE;

  // Radius — bulges in the middle
  const r = maxRadius * (1 - t * 0.7) * (0.3 + 0.7 * Math.sin(t * Math.PI));

  // Height
  const z = t * towerHeight;

  // Element size — bigger at base, smaller at top
  const s = (4 + (1 - t) * 8) * elementScale;

  // Rotation — faces outward + twist
  const facingDeg = (angle + t * spiralTightness * Math.PI) * 180 / Math.PI;

  const element = box(s, s * 0.6, s * 1.2, true)
    .rotate(0, 0, facingDeg)
    .translate(Math.cos(angle) * r, Math.sin(angle) * r, z);

  shapes.push(element);
}

// Central spine
const spine = box(6, 6, towerHeight * 0.9, true)
  .translate(0, 0, towerHeight * 0.45);
shapes.push(spine);

// Crown sphere
const crown = sphere(12 * elementScale)
  .translate(0, 0, towerHeight + 5);
shapes.push(crown);

return shapes;

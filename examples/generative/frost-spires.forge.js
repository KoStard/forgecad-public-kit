/**
 * Frost Spires — Generative Art Demo
 *
 * Translucent ice spires with internal glow, rising from a frozen base.
 * Demonstrates transparency (opacity), clearcoat for ice-like finish,
 * and subtle emissive for inner light.
 *
 * Every shape is a real CAD solid — exportable for 3D printing.
 */

// ---------------------------------------------------------------------------
// Scene — Arctic twilight
// ---------------------------------------------------------------------------
scene({
  background: { top: '#0a1628', bottom: '#1a2a4a' },

  camera: {
    position: [140, -110, 100],
    target: [0, 0, 45],
    fov: 50,
  },

  lights: [
    { type: 'ambient', color: '#1a2a4a', intensity: 0.1 },
    { type: 'directional', position: [80, -60, 150], color: '#b0d4f1', intensity: 1.8 },
    { type: 'point', position: [0, 0, 30], color: '#4fc3f7', intensity: 2, distance: 250, decay: 1.0 },
    { type: 'point', position: [-60, 80, 60], color: '#80deea', intensity: 1.5, distance: 300, decay: 1.2 },
    { type: 'point', position: [70, 50, 10], color: '#e1bee7', intensity: 1.2, distance: 200, decay: 1.5 },
    { type: 'hemisphere', skyColor: '#1a2a4a', groundColor: '#0a1628', intensity: 0.3 },
  ],

  fog: { color: '#0a1628', near: 200, far: 550 },

  postProcessing: {
    bloom: { intensity: Param.number('bloom', 1.2, 0, 4), threshold: 0.5, radius: 0.6 },
    vignette: { darkness: 0.7, offset: 0.3 },
    grain: { intensity: 0.04 },
    toneMappingExposure: Param.number('exposure', 1.4, 0.5, 3),
  },

  capture: {
    framesPerTurn: 90,
    pitchDeg: 20,
  },
});

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const seed = Param.number('seed', 23, 0, 100);
const spireCount = Param.number('spires', 14, 4, 30);
const maxHeight = Param.number('maxHeight', 100, 40, 160);
const spread = Param.number('spread', 55, 20, 100);

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
const rng = mulberry32(seed * 3571);
const rand = (min, max) => min + rng() * (max - min);

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------
const iceColors = ['#b3e5fc', '#e1f5fe', '#81d4fa', '#4fc3f7', '#a8d8ea'];
const glowColors = ['#4fc3f7', '#80deea', '#b2ebf2', '#e0f7fa', '#a8d8ea'];
const deepIce = ['#1565c0', '#1976d2', '#1e88e5', '#2196f3'];

function pick(arr) { return arr[Math.floor(rand(0, arr.length - 0.01))]; }

// ---------------------------------------------------------------------------
// Build the frost field
// ---------------------------------------------------------------------------
const shapes = [];

// Frozen ground — matte ice sheet
shapes.push({
  name: 'Ice Sheet',
  shape: sphere(spread * 0.8)
    .scale([1, 1, 0.06])
    .translate(0, 0, -1)
    .material({
      metalness: 0.0,
      roughness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  color: '#b3e5fc',
});

// Inner glow base — subtle light from beneath the ice
shapes.push({
  name: 'Under Glow',
  shape: sphere(spread * 0.5)
    .scale([1, 1, 0.04])
    .translate(0, 0, -2)
    .material({
      emissive: '#4fc3f7',
      emissiveIntensity: 1.5,
      metalness: 0.0,
      roughness: 0.9,
    }),
  color: '#1a2a4a',
});

// Ice spires
for (let i = 0; i < spireCount; i++) {
  const angle = rand(0, Math.PI * 2);
  const dist = rand(0, spread) * Math.sqrt(rand(0.1, 1));
  const px = Math.cos(angle) * dist;
  const py = Math.sin(angle) * dist;

  const centralness = 1 - dist / spread;
  const h = maxHeight * (0.2 + 0.8 * centralness) * rand(0.4, 1.0);
  const r = rand(2, 5) * (0.5 + 0.5 * centralness);

  // Main spire — translucent ice with clearcoat
  shapes.push({
    name: `Spire ${i + 1}`,
    shape: ngon(6, r)
      .extrude(h)
      .translate(px, py, 0)
      .rotateZ(rand(0, 60))
      .material({
        opacity: rand(0.4, 0.75),
        metalness: 0.0,
        roughness: rand(0.05, 0.2),
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
      }),
    color: pick(iceColors),
  });

  // Inner glow crystal — smaller, emissive core
  if (h > maxHeight * 0.3) {
    shapes.push({
      name: `Core ${i + 1}`,
      shape: ngon(6, r * 0.4)
        .extrude(h * 0.7)
        .translate(px, py, h * 0.1)
        .rotateZ(rand(0, 60))
        .material({
          emissive: pick(glowColors),
          emissiveIntensity: rand(1, 3),
          metalness: 0.0,
          roughness: 0.5,
        }),
      color: pick(deepIce),
    });
  }

  // Tip crystal — small capping piece
  shapes.push({
    name: `Tip ${i + 1}`,
    shape: sphere(r * rand(0.6, 1.0))
      .scale([1, 1, rand(1.5, 2.5)])
      .translate(px, py, h)
      .material({
        opacity: rand(0.3, 0.6),
        metalness: 0.0,
        roughness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.01,
      }),
    color: pick(iceColors),
  });
}

// Scattered ice crystals on the ground
for (let i = 0; i < 10; i++) {
  const angle = rand(0, Math.PI * 2);
  const dist = rand(spread * 0.3, spread * 1.1);
  const size = rand(3, 8);
  shapes.push({
    name: `Crystal ${i + 1}`,
    shape: ngon(6, size)
      .extrude(size * rand(0.3, 0.8))
      .translate(Math.cos(angle) * dist, Math.sin(angle) * dist, 0)
      .rotateX(rand(-15, 15)).rotateY(rand(-15, 15)).rotateZ(rand(0, 60))
      .material({
        opacity: rand(0.4, 0.7),
        metalness: 0.0,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
      }),
    color: pick(iceColors),
  });
}

return shapes;

/**
 * Molten Forge — Generative Art Demo
 *
 * A cluster of metallic pillars rising from a glowing molten base.
 * Demonstrates per-object material control: high metalness for pillars,
 * emissive glow for the molten core, and transparency for the heat haze.
 *
 * Every shape is a real CAD solid — exportable for 3D printing or CNC.
 */

// ---------------------------------------------------------------------------
// Scene — Volcanic forge aesthetic
// ---------------------------------------------------------------------------
scene({
  background: { top: '#0a0000', bottom: '#1a0500' },

  camera: {
    position: [180, -140, 120],
    target: [0, 0, 40],
    fov: 48,
  },

  lights: [
    { type: 'ambient', color: '#1a0500', intensity: 0.05 },
    { type: 'point', position: [0, 0, 10], color: '#ff4500', intensity: 3, distance: 300, decay: 1.0 },
    { type: 'point', position: [80, -60, 100], color: '#ff8c00', intensity: 2, distance: 350, decay: 1.2 },
    { type: 'point', position: [-70, 80, 80], color: '#ff6347', intensity: 1.5, distance: 300, decay: 1.5 },
    { type: 'directional', position: [40, -20, 150], color: '#ffd700', intensity: 0.8 },
    { type: 'hemisphere', skyColor: '#1a0a00', groundColor: '#ff2200', intensity: 0.15 },
  ],

  fog: { color: '#0a0000', near: 200, far: 500 },

  postProcessing: {
    bloom: { intensity: param('bloom', 2.0, 0, 5), threshold: 0.3, radius: 0.8 },
    vignette: { darkness: 0.9, offset: 0.2 },
    grain: { intensity: 0.06 },
    toneMappingExposure: param('exposure', 1.8, 0.5, 4),
  },

  capture: {
    framesPerTurn: 120,
    pitchDeg: 22,
    holdFrames: 8,
  },
});

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const seed = param('seed', 42, 0, 100);
const pillarCount = param('pillars', 18, 5, 40);
const maxHeight = param('maxHeight', 90, 30, 150);
const baseRadius = param('baseRadius', 50, 20, 100);

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
// Color palettes
// ---------------------------------------------------------------------------
const metalColors = ['#8a8a8a', '#a0a0a0', '#707070', '#606060', '#b0b0b0'];
const glowColors = ['#ff4500', '#ff6600', '#ff8c00', '#ff2200', '#cc3300'];

function pick(arr) { return arr[Math.floor(rand(0, arr.length - 0.01))]; }

// ---------------------------------------------------------------------------
// Build the forge
// ---------------------------------------------------------------------------
const shapes = [];

// Molten base — glowing emissive pool
shapes.push({
  name: 'Molten Core',
  shape: sphere(baseRadius * 0.7)
    .scale([1, 1, 0.12])
    .translate(0, 0, 0)
    .material({
      emissive: '#ff4500',
      emissiveIntensity: 3,
      metalness: 0.1,
      roughness: 0.8,
    }),
  color: '#ff2200',
});

// Outer ring — darker cooling lava
shapes.push({
  name: 'Cooling Ring',
  shape: sphere(baseRadius * 0.9)
    .scale([1, 1, 0.08])
    .translate(0, 0, -2)
    .material({
      emissive: '#cc2200',
      emissiveIntensity: 1.5,
      metalness: 0.3,
      roughness: 0.9,
    }),
  color: '#3d0c00',
});

// Metallic pillars rising from the forge
for (let i = 0; i < pillarCount; i++) {
  const angle = rand(0, Math.PI * 2);
  const dist = rand(baseRadius * 0.15, baseRadius * 0.7) * Math.sqrt(rand(0.2, 1));
  const px = Math.cos(angle) * dist;
  const py = Math.sin(angle) * dist;

  // Taller in center
  const centralness = 1 - dist / (baseRadius * 0.7);
  const h = maxHeight * (0.2 + 0.8 * centralness) * rand(0.5, 1.0);
  const r = rand(2, 5) * (0.6 + 0.4 * centralness);

  // Pillar body — polished metal
  const metalColor = pick(metalColors);
  shapes.push({
    name: `Pillar ${i + 1}`,
    shape: cylinder(h, r)
      .translate(px, py, 0)
      .material({
        metalness: rand(0.7, 0.95),
        roughness: rand(0.05, 0.25),
        clearcoat: 0.3,
        clearcoatRoughness: 0.1,
      }),
    color: metalColor,
  });

  // Pillar cap — glowing hot tip
  shapes.push({
    name: `Tip ${i + 1}`,
    shape: sphere(r * rand(1.0, 1.5))
      .translate(px, py, h)
      .material({
        emissive: pick(glowColors),
        emissiveIntensity: rand(1.5, 4),
        metalness: 0.6,
        roughness: 0.3,
      }),
    color: pick(glowColors),
  });

  // Some pillars get a glowing crack ring
  if (rand(0, 1) > 0.6 && h > maxHeight * 0.3) {
    const crackH = h * rand(0.2, 0.6);
    shapes.push({
      name: `Crack ${i + 1}`,
      shape: cylinder(2, r * 1.3)
        .translate(px, py, crackH)
        .material({
          emissive: '#ff6600',
          emissiveIntensity: 2.5,
          metalness: 0.2,
          roughness: 0.7,
        }),
      color: '#ff4500',
    });
  }
}

// Scattered hot embers
for (let i = 0; i < 8; i++) {
  const angle = rand(0, Math.PI * 2);
  const dist = rand(baseRadius * 0.5, baseRadius * 1.2);
  shapes.push({
    name: `Ember ${i + 1}`,
    shape: sphere(rand(2, 5))
      .translate(Math.cos(angle) * dist, Math.sin(angle) * dist, rand(5, 30))
      .material({
        emissive: pick(glowColors),
        emissiveIntensity: rand(2, 5),
        metalness: 0.1,
        roughness: 0.9,
      }),
    color: pick(glowColors),
  });
}

return shapes;

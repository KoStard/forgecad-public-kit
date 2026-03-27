/**
 * Scene API Basics
 *
 * Demonstrates the scene() function for controlling camera,
 * lighting, background, fog, and post-processing.
 *
 * The scene() API gives scripts full control over the visual
 * environment — essential for generative art, presentations,
 * and dramatic renders.
 */

// ---------------------------------------------------------------------------
// Scene configuration — all options shown
// ---------------------------------------------------------------------------
scene({
  // Background: solid color or { top, bottom } gradient
  background: boolParam('dark', true) ? '#1a1a2e' : '#f0f0f0',

  // Camera: position, target, field of view
  camera: {
    position: [150, -100, 80],
    target: [0, 0, 20],
    fov: param('fov', 50, 20, 90),
  },

  // Lights: replaces ALL default lights when specified
  lights: [
    { type: 'ambient', color: '#1a1a3e', intensity: 0.2 },
    { type: 'directional', position: [100, -80, 120], color: '#ff8c42', intensity: param('keyLight', 2, 0, 5) },
    { type: 'point', position: [-80, 60, 60], color: '#4ecdc4', intensity: 1.5, distance: 300 },
    { type: 'hemisphere', skyColor: '#b1e1ff', groundColor: '#1a1a2e', intensity: 0.3 },
  ],

  // Fog: atmospheric depth
  fog: { color: '#1a1a2e', near: 150, far: 500 },

  // Post-processing: bloom, vignette, grain
  postProcessing: {
    bloom: { intensity: param('bloom', 0.5, 0, 3), threshold: 0.8 },
    vignette: { darkness: 0.4, offset: 0.5 },
    toneMappingExposure: param('exposure', 1.2, 0.5, 3),
  },
});

// ---------------------------------------------------------------------------
// Simple geometric composition
// ---------------------------------------------------------------------------
const pedestal = box(60, 60, 8, true);
const mainSphere = sphere(25).translate(0, 0, 33);
const accent1 = cylinder(50, 3).translate(-20, 0, 0);
const accent2 = cylinder(40, 3).rotate(90, 0, 0).translate(0, -20, 28);

return [pedestal, mainSphere, accent1, accent2];

/**
 * Mathematical Surface — Direct G-code toolpath
 *
 * A bowl/wave surface defined by a mathematical function.
 * Prints as concentric spirals following z = f(x, y).
 *
 * The surface function creates an undulating bowl shape.
 */

const outerRadius = Param.number('radius', 40, 15, 60);
const amplitude = Param.number('amplitude', 8, 1, 20);
const waves = Param.number('waves', 4, 1, 8);
const layerHeight = 0.3;
const lineSpacing = 0.6; // spacing between concentric passes

const g = gcode({ nozzle: 0.4, layerHeight, printSpeed: 1500 });

// Surface function: z = f(r, theta)
// Bowl shape with sinusoidal waves on the rim
function surfaceZ(r, theta) {
  const normalized = r / outerRadius;
  const bowl = 0.5 * normalized * normalized * outerRadius; // parabolic bowl
  const wave = amplitude * Math.sin(waves * theta) * normalized * normalized;
  return bowl + wave + layerHeight;
}

g.preheat({ hotend: 210, bed: 60 });
g.setFan(0);

const cx = 110, cy = 110;

g.comment('=== Base layer: flat disc for adhesion ===');
g.travelTo(cx, cy, layerHeight);
g.setSpeed(20);

// Spiral outward from center
const spiralSteps = Math.floor(outerRadius / lineSpacing);
for (let ring = 0; ring <= spiralSteps; ring++) {
  const r = (ring / spiralSteps) * outerRadius;
  const circumference = 2 * Math.PI * Math.max(1, r);
  const steps = Math.max(6, Math.floor(circumference / 0.8));

  for (let s = 0; s <= steps; s++) {
    const theta = (s / steps) * Math.PI * 2;
    // Smoothly interpolate radius for true spiral
    const rr = r + (lineSpacing * s) / (steps || 1);
    const clampedR = Math.min(rr, outerRadius);
    g.extrudeTo(
      cx + clampedR * Math.cos(theta),
      cy + clampedR * Math.sin(theta),
      layerHeight,
    );
  }
}

g.comment('=== Surface: concentric rings following z = f(r, theta) ===');
g.setSpeed(25);
g.setFan(1);

// Print surface from outside in — each ring follows the math surface
const surfaceRings = Math.floor(outerRadius / lineSpacing);
for (let ring = surfaceRings; ring >= 0; ring--) {
  const r = (ring / surfaceRings) * outerRadius;
  const circumference = 2 * Math.PI * Math.max(1, r);
  const steps = Math.max(6, Math.floor(circumference / 0.5));

  for (let s = 0; s <= steps; s++) {
    const theta = (s / steps) * Math.PI * 2;
    const z = surfaceZ(r, theta);
    g.extrudeTo(
      cx + r * Math.cos(theta),
      cy + r * Math.sin(theta),
      z,
    );
  }
}

g.cooldown();

export default g;

/**
 * Lissajous Vase — Direct G-code toolpath
 *
 * A vase whose cross-section is a Lissajous curve that morphs as Z rises.
 * Creates beautiful organic-looking walls with a continuously changing profile.
 */

const a = Param.number('a', 3, 1, 7);     // X frequency
const b = Param.number('b', 2, 1, 7);     // Y frequency
const baseRadius = Param.number('radius', 25, 10, 50);
const height = Param.number('height', 100, 30, 200);
const layerHeight = 0.2;

const g = gcode({ nozzle: 0.4, layerHeight, printSpeed: 1800 });

g.preheat({ hotend: 200, bed: 60 });
g.setFan(0);

const cx = 110, cy = 110;

// Lissajous: x = R*sin(a*t + phase), y = R*sin(b*t)
// As Z increases, the phase shifts, morphing the cross-section

g.comment('=== Base: 3 solid layers ===');
g.travelTo(cx + baseRadius, cy, layerHeight);
g.setSpeed(20);

for (let layer = 0; layer < 3; layer++) {
  const z = layerHeight * (layer + 1);
  for (let r = baseRadius; r >= 1; r -= 0.6) {
    const steps = Math.max(24, Math.floor(2 * Math.PI * r / 0.8));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      g.extrudeTo(cx + r * Math.cos(t), cy + r * Math.sin(t), z);
    }
  }
}

g.comment('=== Lissajous wall ===');
g.setSpeed(30);
g.setFan(1.0);

const stepsPerLoop = 200;
const totalZ = height - layerHeight * 3;
const zPerStep = layerHeight / stepsPerLoop;
const totalSteps = Math.floor(totalZ / zPerStep);

for (let i = 0; i <= totalSteps; i++) {
  const z = layerHeight * 3 + i * zPerStep;
  const t = (i / stepsPerLoop) * Math.PI * 2;
  const zFrac = (z - layerHeight * 3) / totalZ;

  // Phase shift creates the morphing effect
  const phase = zFrac * Math.PI * 2;

  // Lissajous in polar-ish form
  const lx = Math.sin(a * t + phase);
  const ly = Math.sin(b * t);

  // Convert to radius modulation
  const modulation = 0.3 * Math.sqrt(lx * lx + ly * ly);
  const R = baseRadius * (1 + modulation - 0.1 * zFrac);

  // Angle follows t but with Lissajous distortion
  const angle = t + 0.2 * lx;

  g.extrudeTo(
    cx + R * Math.cos(angle),
    cy + R * Math.sin(angle),
    z,
  );
}

g.cooldown();

export default g;

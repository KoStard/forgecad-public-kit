/**
 * Parametric Vase — Direct G-code toolpath
 *
 * A continuous spiral vase with a sine-wave modulated radius.
 * Prints in one continuous extrusion (no retractions, no seams).
 *
 * Try tweaking: amplitude, frequency, baseRadius, height, layerHeight.
 */

const amplitude = Param.number('amplitude', 8, 1, 20);
const frequency = Param.number('frequency', 6, 1, 20);
const baseRadius = Param.number('radius', 25, 10, 60);
const height = Param.number('height', 80, 20, 200);
const layerHeight = 0.2;
const nozzle = 0.4;

const g = gcode({ nozzle, layerHeight, printSpeed: 1800 });

// Preheat and setup
g.preheat({ hotend: 200, bed: 60 });
g.setFan(0);

// Move to start position
const startR = baseRadius + amplitude * Math.sin(0);
g.travelTo(startR + 110, 110, layerHeight);

g.comment('=== First layer: solid base disc ===');
g.setSpeed(20); // slow first layer

// Print a solid disc base (3 layers of concentric circles)
for (let layer = 0; layer < 3; layer++) {
  const z = layerHeight * (layer + 1);
  // Concentric circles from outside in
  for (let r = baseRadius + amplitude; r >= nozzle * 2; r -= nozzle * 0.8) {
    const steps = Math.max(24, Math.floor(2 * Math.PI * r / 1.0));
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      g.extrudeTo(
        110 + r * Math.cos(a),
        110 + r * Math.sin(a),
        z,
      );
    }
  }
}

g.comment('=== Vase wall: continuous spiral ===');
g.setSpeed(30);
g.setFan(1.0);

// Continuous spiral — z ramps continuously, no layer boundaries
const stepsPerRev = 120;
const totalZ = height - layerHeight * 3;
const zPerStep = layerHeight / stepsPerRev;
const totalSteps = Math.floor(totalZ / zPerStep);

for (let i = 0; i <= totalSteps; i++) {
  const z = layerHeight * 3 + i * zPerStep;
  const a = (i / stepsPerRev) * Math.PI * 2;
  const t = z / height;

  // Modulate radius with sine wave — frequency increases slightly with height
  const freqMod = frequency + t * 2;
  const ampMod = amplitude * (0.5 + 0.5 * t); // amplitude grows with height
  const r = baseRadius * (1 - 0.15 * t) + ampMod * Math.sin(freqMod * a + t * Math.PI);

  g.extrudeTo(
    110 + r * Math.cos(a),
    110 + r * Math.sin(a),
    z,
  );
}

g.comment('=== Top rim: one full circle at final radius ===');
const finalZ = layerHeight * 3 + totalSteps * zPerStep;
for (let i = 0; i <= stepsPerRev; i++) {
  const a = (i / stepsPerRev) * Math.PI * 2;
  const t = 1;
  const freqMod = frequency + t * 2;
  const ampMod = amplitude * (0.5 + 0.5 * t);
  const r = baseRadius * (1 - 0.15 * t) + ampMod * Math.sin(freqMod * a + t * Math.PI);
  g.extrudeTo(110 + r * Math.cos(a), 110 + r * Math.sin(a), finalZ);
}

g.cooldown();

export default g;

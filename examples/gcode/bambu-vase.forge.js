/**
 * Bambu Lab A1 — spiral vase example
 *
 * Generates a BambuStudio-compatible G-code file that can be loaded
 * directly via BambuStudio or SD card without filament mapping errors.
 */
const radius = 24;
const height = 42;
const layerHeight = 0.22;

const g = gcode({
  printer: 'bambu-a1',
  filamentType: 'PLA',
  filamentColor: '#FFFFFF',
  nozzle: 0.4,
  layerHeight,
});

const cx = 128; // center of Bambu A1 bed
const cy = 128;

g.preheat({ hotend: 220, bed: 55 });
g.setFan(0);

// Small spiral base for adhesion
g.travelTo(cx + 0.4, cy, layerHeight);
g.setSpeed(16);
for (let i = 0; i <= 1200; i += 1) {
  const u = i / 1200;
  const angle = u * Math.PI * 18;
  const r = 0.4 + u * radius;
  g.extrudeTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle), layerHeight);
}

// Continuous spiral wall
g.setFan(1);
g.setSpeed(30);
const stepsPerTurn = 160;
const totalSteps = Math.floor((height / layerHeight) * stepsPerTurn);
for (let i = 0; i <= totalSteps; i += 1) {
  const t = i / totalSteps;
  const angle = (i / stepsPerTurn) * Math.PI * 2;
  const r2 = radius * (1 - 0.15 * t) + 4 * Math.sin(5 * angle - 8 * t);
  g.extrudeTo(
    cx + r2 * Math.cos(angle),
    cy + r2 * Math.sin(angle),
    layerHeight + t * (height - layerHeight),
  );
}

g.cooldown();

export default g;

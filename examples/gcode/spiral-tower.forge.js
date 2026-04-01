/**
 * Spiral Tower — Direct G-code toolpath
 *
 * A twisted hexagonal tower that rotates as it rises.
 * Each layer is a hexagon that twists slightly more than the last.
 */

const sides = param('sides', 6, 3, 12);
const radius = param('radius', 20, 10, 40);
const height = param('height', 60, 20, 120);
const twistDeg = param('twist', 90, 0, 360);
const layerHeight = 0.2;

const g = gcode({ nozzle: 0.4, layerHeight, printSpeed: 1800 });

g.preheat({ hotend: 200, bed: 60 });
g.setFan(0);

const cx = 110, cy = 110;
const layers = Math.floor(height / layerHeight);

g.comment('=== Twisted polygon tower ===');

for (let layer = 0; layer < layers; layer++) {
  const z = layerHeight * (layer + 1);
  const t = layer / layers;
  const twist = (twistDeg * Math.PI / 180) * t;

  // Taper slightly
  const r = radius * (1 - 0.1 * t);

  // Speed: slow first layer, then normal
  if (layer === 0) g.setSpeed(20);
  else if (layer === 1) { g.setSpeed(30); g.setFan(1); }

  // Travel to first vertex of polygon
  const a0 = twist;
  if (layer === 0) {
    g.travelTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0), z);
  }

  // Draw polygon
  for (let v = 0; v <= sides; v++) {
    const a = twist + (v / sides) * Math.PI * 2;
    g.extrudeTo(
      cx + r * Math.cos(a),
      cy + r * Math.sin(a),
      z,
    );
  }
}

g.cooldown();

export default g;

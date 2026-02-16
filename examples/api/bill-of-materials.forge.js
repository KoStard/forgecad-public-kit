// API demo: script-declared bill of materials that gets auto-summed in report export

const frameWidth = param('Frame Width', 900, { min: 300, max: 1800, unit: 'mm' });
const frameDepth = param('Frame Depth', 500, { min: 200, max: 1200, unit: 'mm' });
const legHeight = param('Leg Height', 720, { min: 300, max: 1200, unit: 'mm' });
const tubeW = param('Tube Width', 30, { min: 15, max: 80, unit: 'mm' });
const tubeH = param('Tube Height', 20, { min: 10, max: 80, unit: 'mm' });

const frontBolts = param('Front Bolts', 8, { min: 0, max: 64, integer: true });
const rearBolts = param('Rear Bolts', 8, { min: 0, max: 64, integer: true });
const boltLength = param('Bolt Length', 16, { min: 6, max: 60, unit: 'mm' });

const wall = 2;
const longTubeMm = frameWidth * 2;
const shortTubeMm = frameDepth * 2;
const legTubeMm = legHeight * 4;
const totalTubeMm = longTubeMm + shortTubeMm + legTubeMm;

// Physical materials are authored by code, not inferred from mesh primitives.
bom(totalTubeMm, `iron tube with dimensions ${tubeW} x ${tubeH}`, { unit: 'mm' });

// These two lines intentionally share the same descriptor so report export sums them.
bom(frontBolts, `M4 bolt of ${boltLength} mm length`, { unit: 'pieces' });
bom(rearBolts, `M4 bolt of ${boltLength} mm length`, { unit: 'pieces' });

const railFront = box(frameWidth, tubeW, tubeH).color('#778da9');
const railBack = box(frameWidth, tubeW, tubeH).translate(0, frameDepth - tubeW, 0).color('#778da9');
const railLeft = box(tubeW, frameDepth, tubeH).color('#778da9');
const railRight = box(tubeW, frameDepth, tubeH).translate(frameWidth - tubeW, 0, 0).color('#778da9');

const legSize = Math.min(tubeW, tubeH);
const legA = box(legSize, legSize, legHeight).translate(0, 0, tubeH).color('#415a77');
const legB = box(legSize, legSize, legHeight).translate(frameWidth - legSize, 0, tubeH).color('#415a77');
const legC = box(legSize, legSize, legHeight).translate(0, frameDepth - legSize, tubeH).color('#415a77');
const legD = box(legSize, legSize, legHeight).translate(frameWidth - legSize, frameDepth - legSize, tubeH).color('#415a77');

return [
  { name: 'Front Rail', shape: railFront },
  { name: 'Back Rail', shape: railBack },
  { name: 'Left Rail', shape: railLeft },
  { name: 'Right Rail', shape: railRight },
  { name: 'Leg A', shape: legA },
  { name: 'Leg B', shape: legB },
  { name: 'Leg C', shape: legC },
  { name: 'Leg D', shape: legD },
];

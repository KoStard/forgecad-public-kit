// Sheet stock cut-list example
// Demonstrates terminal-first cut-list output plus a simple exploded preview.

const material = '4mm birch plywood';
const thickness = 4;

const parts = [
  { width: 228, height: 206, description: 'Base Bottom Panel', quantity: 1 },
  { width: 228, height: 94.5, description: 'Base Front/Back Panel', quantity: 2 },
  { width: 198, height: 94.5, description: 'Base Side Panel', quantity: 2 },
  { width: 228, height: 206, description: 'Lid Top Panel', quantity: 1 },
  { width: 228, height: 18, description: 'Lid Front/Back Panel', quantity: 2 },
  { width: 198, height: 18, description: 'Lid Side Panel', quantity: 2 },
  { width: 220, height: 94.5, description: 'Lower Divider Panel', quantity: 1 },
  { width: 110, height: 94.5, description: 'Upper Divider Panel', quantity: 1 },
];

for (const part of parts) {
  sheetStock(part.width, part.height, part.description, {
    material,
    quantity: part.quantity,
  });
}

const preview = [];
let x = 0;
let y = 0;
const gap = 16;
const rowWidth = 520;

for (const part of parts) {
  for (let i = 0; i < part.quantity; i += 1) {
    const shape = box(part.width, part.height, thickness).translate(x, y, 0);
    const name = part.quantity > 1 ? `${part.description} ${i + 1}` : part.description;
    preview.push({ name, shape });

    x += part.width + gap;
    if (x > rowWidth) {
      x = 0;
      y += 240;
    }
  }
}

return preview;

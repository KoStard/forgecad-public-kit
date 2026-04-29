// Colors: union() vs returning separate objects.
//
// ❌ union() merges into one mesh → only the first shape's color survives.
// ✅ Returning an array of {name, shape} → each keeps its own color.

const size = 25;
const gap = 5;

// --- Three colored boxes ---
const red   = box(size, size, size).color('#cc4444');
const green = box(size, size, size).color('#44cc44').translate(size + gap, 0, 0);
const blue  = box(size, size, size).color('#4444cc').translate(2 * (size + gap), 0, 0);

// BAD: union kills individual colors — result is all red (first shape's color)
const merged = union(red, green, blue).translate(-80, 0, 0);

// GOOD: separate objects keep their colors
const redSep   = box(size, size, size).color('#cc4444').translate(80, 0, 0);
const greenSep = box(size, size, size).color('#44cc44').translate(80 + size + gap, 0, 0);
const blueSep  = box(size, size, size).color('#4444cc').translate(80 + 2 * (size + gap), 0, 0);

return [
  { name: "❌ Union (all one color)", shape: merged },
  { name: "✅ Red (separate)", shape: redSep },
  { name: "✅ Green (separate)", shape: greenSep },
  { name: "✅ Blue (separate)", shape: blueSep },
];

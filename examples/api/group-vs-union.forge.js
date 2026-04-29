// group() vs union() — when to use which.
//
// union(a, b)  → merges into ONE mesh. Only the first operand's color survives
//                 unless you recolor the result. Good for boolean operands.
// group(a, b)  → keeps separate. Colors preserved. Transforms together.
//
// Use union when you need a single solid (e.g., to subtract from something).
// Use group when you want parts to move together but stay visually distinct.

const base = box(60, 60, 5).color('#888888');
const col = cylinder(30, 5).color('#cc4444')
  .attachTo(base, 'top', 'bottom');

// --- group: colors preserved, transforms together (with named children) ---
const grouped = group(
  { name: "Base", shape: base },
  { name: "Column", shape: col }
).translate(-50, 0, 0);

// --- union: one solid, recolored after the boolean ---
const unioned = union(base, col).translate(50, 0, 0).color('#4488cc');

return [
  grouped,  // each child becomes a separate viewport object with names
  { name: "Union (single solid)", shape: unioned },
];

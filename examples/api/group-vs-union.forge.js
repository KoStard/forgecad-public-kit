// group() vs union() — when to use which.
//
// union(a, b)  → merges into ONE mesh. Colors lost. Good for boolean operand.
// group(a, b)  → keeps separate. Colors preserved. Transforms together.
//
// Use union when you need a single solid (e.g., to subtract from something).
// Use group when you want parts to move together but stay visually distinct.

const base = box(60, 60, 5, true).color('#888888');
const col = cylinder(30, 5).color('#cc4444')
  .attachTo(base, 'top', 'bottom');

// --- group: colors preserved, transforms together ---
const grouped = group(base, col).translate(-50, 0, 0);

// --- union: one solid, one color ---
const unioned = union(base, col).translate(50, 0, 0).color('#4488cc');

return [
  grouped,  // each child becomes a separate viewport object
  { name: "Union (single solid)", shape: unioned },
];

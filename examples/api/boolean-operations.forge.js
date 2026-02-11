// Boolean operations — union, difference, intersection.
//
// union(a, b)        → combined volume
// difference(a, b)   → a minus b (subtract b from a)
// intersection(a, b) → only the overlapping volume
//
// Method syntax: a.add(b), a.subtract(b), a.intersect(b)

const size = param("Size", 30, { min: 15, max: 50, unit: "mm" });
const overlap = param("Overlap", 15, { min: 0, max: 30, unit: "mm" });
const spacing = 80;

// Two overlapping shapes for each demo
function makePair(offsetX) {
  const a = box(size, size, size, true).translate(offsetX, 0, 0).color('#4488cc');
  const b = sphere(size * 0.6).translate(offsetX + size - overlap, 0, 0).color('#cc4444');
  return [a, b];
}

// 1. Union — combined
const [u1, u2] = makePair(0);
const unioned = union(u1, u2).color('#8866cc');

// 2. Difference — box minus sphere
const [d1, d2] = makePair(spacing);
const diffed = d1.subtract(d2);

// 3. Intersection — only overlap
const [i1, i2] = makePair(2 * spacing);
const intersected = intersection(i1, i2).color('#cc8844');

// Show the original shapes (translucent-ish via separate objects) for reference
const refA = box(size, size, size, true).translate(3 * spacing, 0, 0).color('#4488cc');
const refB = sphere(size * 0.6).translate(3 * spacing + size - overlap, 0, 0).color('#cc4444');

return [
  { name: "Union", shape: unioned },
  { name: "Difference (box - sphere)", shape: diffed },
  { name: "Intersection", shape: intersected },
  { name: "Original Box", shape: refA },
  { name: "Original Sphere", shape: refB },
];

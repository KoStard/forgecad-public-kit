// Expert: 90° pipe elbow via sweep approximation
// Build as union of rotated cylinders along a 90° arc
const outerR = 15;
const innerR = 12;
const bendR = 40;
const segments = 24;

let result = null;
for (let i = 0; i < segments; i++) {
  const a0 = (i / segments) * Math.PI / 2;
  const a1 = ((i + 1) / segments) * Math.PI / 2;
  const cx0 = bendR * Math.cos(a0);
  const cz0 = bendR * Math.sin(a0);
  const cx1 = bendR * Math.cos(a1);
  const cz1 = bendR * Math.sin(a1);

  // Outer cylinder segment between two arc points
  const dx = cx1 - cx0;
  const dz = cz1 - cz0;
  const segLen = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx) * 180 / Math.PI;

  const seg = cylinder(segLen + 1, outerR, outerR, 24, true)
    .rotate(0, -angle, 0)
    .translate((cx0 + cx1) / 2, 0, (cz0 + cz1) / 2);

  result = result ? union(result, seg) : seg;
}

// Hollow out the center with the same arc
let inner = null;
for (let i = 0; i < segments; i++) {
  const a0 = (i / segments) * Math.PI / 2;
  const a1 = ((i + 1) / segments) * Math.PI / 2;
  const cx0 = bendR * Math.cos(a0);
  const cz0 = bendR * Math.sin(a0);
  const cx1 = bendR * Math.cos(a1);
  const cz1 = bendR * Math.sin(a1);
  const dx = cx1 - cx0;
  const dz = cz1 - cz0;
  const segLen = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx) * 180 / Math.PI;

  const seg = cylinder(segLen + 3, innerR, innerR, 24, true)
    .rotate(0, -angle, 0)
    .translate((cx0 + cx1) / 2, 0, (cz0 + cz1) / 2);

  inner = inner ? union(inner, seg) : seg;
}

return result.subtract(inner);

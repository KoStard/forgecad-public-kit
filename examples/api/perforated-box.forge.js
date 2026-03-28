// Perforated box — speaker grille aesthetic
// Clean geometric pattern with regular circular holes

const panel = sdf.box(20, 3, 20);
const holes = sdf.perforated({ radius: 1.5, spacing: 6 });

return panel
  .subtract(holes)
  .toShape({ edgeLength: 0.8, bounds: { min: [-12, -3, -12], max: [12, 3, 12] } })
  .color('#2a2a2a');

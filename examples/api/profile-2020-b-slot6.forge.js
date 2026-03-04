// 20x20 B-type slot 6 profile extrusion.
// Demonstrates:
// - algorithmic 2D profile generation (`lib.tSlotProfile`)
// - direct 3D helper (`lib.profile2020BSlot6`)
// - parameterized technical dimensions

const length = param("Length", 220, { min: 40, max: 800, unit: "mm" });
const slotDepth = param("Slot Depth", 5.5, { min: 4.6, max: 6.6, step: 0.1, unit: "mm" });
const slotInner = param("Slot Inner Width", 8.2, { min: 7, max: 10.5, step: 0.1, unit: "mm" });
const centerBore = param("Center Bore", 5.5, { min: 0, max: 6.5, step: 0.1, unit: "mm" });
const pocketDia = param("Pocket Dia", 4.0, { min: 0, max: 6, step: 0.1, unit: "mm" });

const profile2d = lib.profile2020BSlot6Profile({
  slotInnerWidth: slotInner,
  slotDepth,
  centerBoreDia: centerBore,
  cornerPocketDia: pocketDia,
});

const extrusion = lib.profile2020BSlot6(length, {
  center: true,
  slotDepth,
  slotInnerWidth: slotInner,
  centerBoreDia: centerBore,
  cornerPocketDia: pocketDia,
}).color('#98a7b8');

// Visual dimensions
dim([-10, -10, 0], [10, -10, 0], { label: "20 mm", offset: -8, color: "#ffaa44" });
dim([10, -10, 0], [10, 10, 0], { label: "20 mm", offset: 10, color: "#ffaa44" });
dim([0, 0, -length / 2], [0, 0, length / 2], { label: "Length", offset: 16, color: "#66ccff" });
if (centerBore > 0) {
  dim([-centerBore / 2, 0, 0], [centerBore / 2, 0, 0], { label: "Center bore", offset: -14, color: "#88dd88" });
}

return [
  { name: "2D Profile", sketch: profile2d.translate(-34, 0), color: "#f3c98b" },
  { name: "3D Extrusion", shape: extrusion.translate(36, 0, 0), color: "#98a7b8" },
];

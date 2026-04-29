// Test assembly grouping — nested group format
const baseW = Param.number("Base Width", 100, { min: 60, max: 200, unit: "mm" });
const baseD = Param.number("Base Depth", 80, { min: 40, max: 150, unit: "mm" });

// Bed assembly
const bedPlate = box(baseW, baseD, 5).color('#666666');
const glass = box(baseW - 10, baseD - 10, 3).translate(5, 5, 5).color('#aaddff');
const heater = box(baseW - 20, baseD - 20, 1).translate(10, 10, -1).color('#cc4444');

// Gantry
const leftRail = box(5, baseD, 60).translate(-10, 0, 8).color('#888888');
const rightRail = box(5, baseD, 60).translate(baseW + 5, 0, 8).color('#888888');
const crossBar = box(baseW + 20, 5, 5).translate(-10, baseD / 2, 63).color('#aaaaaa');

// Extruder (intentionally overlaps crossbar — intra-group collision)
const nozzle = cylinder(15, 4).translate(baseW / 2, baseD / 2, 48).color('#ff8800');
const heatsink = box(20, 20, 10).translate(baseW / 2, baseD / 2, 60).color('#cccccc');

return [
  { name: "Bed Assembly", group: [
    { name: "Bed Plate", shape: bedPlate },
    { name: "Glass Bed", shape: glass },
    { name: "Heater", shape: heater },
  ]},
  { name: "Gantry", group: [
    { name: "Left Rail", shape: leftRail },
    { name: "Right Rail", shape: rightRail },
    { name: "Cross Bar", shape: crossBar },
  ]},
  { name: "Extruder", group: [
    { name: "Nozzle", shape: nozzle },
    { name: "Heatsink", shape: heatsink },
  ]},
];
